/*
 * Servidor do Reino dos Guardiões.
 * Tudo que vale dinheiro (moedas, gemas, cartas, compras, progresso) mora AQUI, ligado à CONTA do jogador.
 * O mesmo servidor atende o SITE (jogo no navegador) e o APP Android: a conta é a mesma nos dois.
 */
'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const Sim = require('../shared/sim.js');
const Eco = require('../shared/economy.js');
const play = require('./googleplay.js');
const mp = require('./mercadopago.js');
const { createStore } = require('./db.js');

const PORT = process.env.PORT || 8080;
const PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET;
if (PROD && (!JWT_SECRET || JWT_SECRET.length < 32)) { console.error('Defina JWT_SECRET (32+ caracteres) no ambiente.'); process.exit(1); }
const SECRET = JWT_SECRET || 'dev-secret-somente-para-testes-locais-0000';
// IDs de cliente OAuth do Google (web e Android), separados por vírgula
const GOOGLE_CLIENT_IDS = (process.env.GOOGLE_CLIENT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const googleAuth = new OAuth2Client();
const secureRand = () => crypto.randomInt(0, 1000000000) / 1000000000;

const store = createStore();
const ready = store.init();

// Executa uma alteração no jogador de forma atômica e devolve a visão pública
async function mutate(id, fn) {
  const out = await store.withPlayer(id, fn);
  const p = out.__p; delete out.__p;
  if (p) out.player = Eco.publicView(p, Date.now());
  return out;
}
const send = (res, out) => res.status(out.error ? 400 : 200).json(out);
const wrap = (fn) => (req, res) => fn(req, res).catch(e => { console.error('[erro]', e); res.status(500).json({ error: 'Erro no servidor, tente de novo' }); });
const tokenFor = (pid) => jwt.sign({ sub: pid }, SECRET, { expiresIn: '180d' });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------- App ----------
const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://accounts.google.com'],
    scriptSrcAttr: ["'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https://accounts.google.com'],
    frameSrc: ['https://accounts.google.com'],
  } },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use('/api/', rateLimit({ windowMs: 60000, limit: 150, standardHeaders: true, legacyHeaders: false }));
app.use('/api/', (req, res, next) => ready.then(() => next(), (e) => res.status(503).json({ error: 'Banco de dados indisponível' })));

async function authOptional(req) {
  const h = req.headers.authorization || '';
  if (!h) return null;
  try { return jwt.verify(h.replace(/^Bearer /, ''), SECRET).sub; } catch (e) { return null; }
}
function auth(req, res, next) {
  (async () => {
    const pid = await authOptional(req);
    if (!pid) return res.status(401).json({ error: 'Sessão inválida' });
    const row = await store.getPlayer(pid);
    if (!row) return res.status(401).json({ error: 'Sessão inválida' });
    if (row.banned) return res.status(403).json({ error: 'Conta suspensa por trapaça' });
    req.pid = pid;
    next();
  })().catch(e => { console.error(e); res.status(500).json({ error: 'Erro no servidor' }); });
}
async function loginResponse(pid, extra) {
  const row = await store.getPlayer(pid);
  if (row.banned) return { error: 'Conta suspensa por trapaça' };
  return Object.assign({ token: tokenFor(pid), playerId: pid, player: Eco.publicView(row.data, Date.now()) }, extra || {});
}
const validDevice = (d) => /^[a-zA-Z0-9-]{32,64}$/.test(d);

app.get('/health', (req, res) => res.json({ ok: true, banco: store.kind }));

// Configuração para o app no SITE (gerada pelo servidor: não é preciso editar arquivo)
app.get('/js/config.js', (req, res) => {
  res.type('application/javascript').set('Cache-Control', 'no-store');
  res.send(`window.GAME_CONFIG = ${JSON.stringify({ API_URL: '', DEMO: false, GOOGLE_CLIENT_ID: GOOGLE_CLIENT_IDS[0] || '', WEB_PAY: mp.enabled || mp.DEV_FAKE })};`);
});

// =================== CONTAS ===================
// 1) Convidado: o aparelho gera um ID aleatório
app.post('/api/auth/guest', rateLimit({ windowMs: 3600000, limit: 30 }), wrap(async (req, res) => {
  const device = String(req.body.deviceId || '');
  if (!validDevice(device)) return res.status(400).json({ error: 'deviceId inválido' });
  let pid = await store.findIdentity('device', device);
  if (!pid) {
    pid = crypto.randomUUID();
    await store.createPlayer(pid, Eco.newPlayer(Date.now()));
    await store.setIdentity('device', device, pid);
  }
  send(res, await loginResponse(pid));
}));

// 2) Entrar com GOOGLE: a mesma conta no site e no app (troca de celular sem perder nada)
app.post('/api/auth/google', rateLimit({ windowMs: 3600000, limit: 30 }), wrap(async (req, res) => {
  if (!GOOGLE_CLIENT_IDS.length) return res.status(400).json({ error: 'Login com Google ainda não configurado no servidor' });
  let payload;
  try { payload = (await googleAuth.verifyIdToken({ idToken: String(req.body.idToken || ''), audience: GOOGLE_CLIENT_IDS })).getPayload(); }
  catch (e) { return res.status(401).json({ error: 'Login do Google inválido' }); }
  const gid = payload.sub, device = String(req.body.deviceId || '');
  let pid = await store.findIdentity('google', gid), linked = false;
  if (!pid) {
    // primeira vez com esta conta Google: liga ao progresso atual deste aparelho (ou cria conta nova)
    pid = await authOptional(req);
    if (!pid || !(await store.getPlayer(pid))) { pid = crypto.randomUUID(); await store.createPlayer(pid, Eco.newPlayer(Date.now())); }
    await store.setIdentity('google', gid, pid);
    linked = true;
  }
  if (validDevice(device)) await store.setIdentity('device', device, pid);
  await store.withPlayer(pid, (p) => { p.email = payload.email || p.email; if (!p.nameSet && payload.given_name) p.name = String(payload.given_name).slice(0, 16); return { ok: true }; });
  send(res, await loginResponse(pid, { linked }));
}));

// 3) CÓDIGO DE RECUPERAÇÃO: para quem não quer usar Google
app.post('/api/account/code', auth, wrap(async (req, res) => {
  const ab = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RG';
  for (let i = 0; i < 12; i++) code += (i % 4 === 0 ? '-' : '') + ab[crypto.randomInt(0, ab.length)];
  await store.removeIdentities('code', req.pid);                  // código antigo deixa de valer
  await store.setIdentity('code', sha(code), req.pid);
  res.json({ ok: true, code });
}));
app.post('/api/auth/recover', rateLimit({ windowMs: 3600000, limit: 10 }), wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pretty = code.length === 14 ? code.slice(0, 2) + '-' + code.slice(2, 6) + '-' + code.slice(6, 10) + '-' + code.slice(10) : '';
  const pid = pretty && await store.findIdentity('code', sha(pretty));
  if (!pid) return res.status(400).json({ error: 'Código não encontrado' });
  const device = String(req.body.deviceId || '');
  if (validDevice(device)) await store.setIdentity('device', device, pid);
  send(res, await loginResponse(pid));
}));
app.get('/api/account', auth, wrap(async (req, res) => {
  const ids = await store.identitiesOf(req.pid), row = await store.getPlayer(req.pid);
  res.json({ ok: true, google: ids.some(i => i.kind === 'google') ? (row.data.email || 'conectado') : null, hasCode: ids.some(i => i.kind === 'code'),
    purchases: (await store.purchasesOf(req.pid)).map(x => ({ product: x.product, at: Number(x.at), state: x.state, provider: x.provider })) });
}));

// =================== JOGO ===================
app.get('/api/me', auth, wrap(async (req, res) => send(res, await mutate(req.pid, () => ({ ok: true })))));

app.post('/api/level/start', auth, wrap(async (req, res) => {
  let cfg;
  const out = await mutate(req.pid, (p) => { const r = Eco.startLevel(p, req.body.level, Date.now(), !!req.body.bonus); if (r.error) return r; cfg = r.cfg; return { ok: true }; });
  if (out.error) return send(res, out);
  const runId = crypto.randomUUID();
  await store.insertRun(runId, req.pid, cfg);                    // só uma partida aberta por vez
  send(res, Object.assign(out, { runId, cfg }));
}));

app.post('/api/level/finish', auth, wrap(async (req, res) => {
  const run = await store.takeRun(String(req.body.runId || ''), req.pid);    // não dá pra enviar 2x
  if (!run) return res.status(400).json({ error: 'Partida não encontrada' });
  const out = await mutate(req.pid, (p) => Eco.finishLevel(p, { cfg: run.cfg, startedAt: Number(run.started) }, req.body.actions, Date.now(), secureRand));
  if (out.cheat) { await store.addCheat(req.pid); console.warn('[anti-hack]', req.pid, out.error); }
  send(res, out);
}));

app.post('/api/upgrade', auth, wrap(async (req, res) => send(res, await mutate(req.pid, (p) => Eco.upgrade(p, String(req.body.tower))))));
app.post('/api/shop/buy', auth, wrap(async (req, res) => send(res, await mutate(req.pid, (p) => Eco.buyShop(p, String(req.body.item), Date.now())))));
// Baús: o SORTEIO é feito aqui no servidor (impossível manipular pelo app)
app.post('/api/chest/open', auth, wrap(async (req, res) => send(res, await mutate(req.pid, (p) => Eco.openChest(p, String(req.body.type), secureRand, Date.now(), req.body.pay === 'coins' ? 'coins' : 'gems')))));
app.post('/api/offer/buy', auth, wrap(async (req, res) => send(res, await mutate(req.pid, (p) => Eco.buyOffer(p, req.body.i, Date.now())))));
app.post('/api/daily/claim', auth, wrap(async (req, res) => send(res, await mutate(req.pid, (p) => Eco.claimDaily(p, Date.now(), secureRand)))));
app.post('/api/name', auth, wrap(async (req, res) => {
  const name = String(req.body.name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16);
  if (name.length < 3) return res.status(400).json({ error: 'Nome muito curto' });
  send(res, await mutate(req.pid, (p) => { p.name = name; p.nameSet = true; return { ok: true }; }));
}));

// =================== COMPRAS ===================
// Entrega as gemas UMA vez por compra (vale para Google Play, PIX e cartão)
async function deliver(token, player, productId) {
  if (!(await store.swapPurchaseState(token, 'pending', 'ok'))) return null;
  return mutate(player, (p) => Eco.grantIap(p, productId));
}

// --- APP Android: Google Play ---
app.post('/api/iap/verify', auth, wrap(async (req, res) => {
  const productId = String(req.body.productId || '');
  const token = String(req.body.purchaseToken || '');
  if (!Sim.ECON.IAP[productId] || token.length < 10 || token.length > 1000) return res.status(400).json({ error: 'Compra inválida' });
  const already = await store.getPurchase('gp:' + token);
  if (already && already.state !== 'pending') {
    if (already.player !== req.pid) return res.status(400).json({ error: 'Compra pertence a outra conta' });
    return send(res, await mutate(req.pid, () => ({ ok: true, duplicate: true })));
  }
  let g;
  try { g = await play.verifyProduct(productId, token); }
  catch (e) { console.error('[iap]', e.message); return res.status(502).json({ error: 'Não foi possível confirmar com o Google. Tente de novo.' }); }
  if (g.purchaseState !== 0) return res.status(400).json({ error: 'Pagamento não concluído' });
  if (g.obfuscatedExternalAccountId && g.obfuscatedExternalAccountId !== play.accountHash(req.pid)) return res.status(400).json({ error: 'Compra de outra conta' });
  if (g.orderId) { const o = await store.getPurchaseByOrder(g.orderId); if (o && o.token !== 'gp:' + token) return res.status(400).json({ error: 'Pedido já usado' }); }
  await store.insertPurchase({ token: 'gp:' + token, player: req.pid, product: productId, order_id: g.orderId, state: 'pending', test: g.purchaseType === 0, provider: 'google_play', amount: Sim.ECON.IAP[productId].brl });
  const out = await deliver('gp:' + token, req.pid, productId);
  if (!out) return send(res, await mutate(req.pid, () => ({ ok: true, duplicate: true })));
  console.log('[iap] Google Play aprovado', productId, g.orderId);
  send(res, out);
}));

// --- SITE: PIX e cartão (Mercado Pago) ---
app.post('/api/pay/create', auth, rateLimit({ windowMs: 600000, limit: 20 }), wrap(async (req, res) => {
  const productId = String(req.body.productId || ''), it = Sim.ECON.IAP[productId];
  if (!it) return res.status(400).json({ error: 'Produto inválido' });
  const email = String(req.body.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido para o comprovante' });
  const ref = req.pid + '.' + productId + '.' + crypto.randomBytes(5).toString('hex');
  const title = 'Reino dos Guardiões — ' + it.gems + ' gemas';
  try {
    if (req.body.method === 'card') { const c = await mp.createCardLink({ ref, amount: it.brl, title, email }); return res.json({ ok: true, ref, url: c.url, devId: mp.DEV_FAKE ? c.id : undefined }); }
    const x = await mp.createPix({ ref, amount: it.brl, title, email });
    res.json({ ok: true, ref, qr: x.qr, qrImage: x.qrImage, ticket: x.ticket, devId: mp.DEV_FAKE ? x.id : undefined });
  } catch (e) { console.error('[mp]', e.message); res.status(502).json({ error: e.message }); }
}));
// Confere um pagamento no Mercado Pago e entrega se aprovado (idempotente)
async function settleMpPayment(pay) {
  if (!pay || pay.status !== 'approved') return null;
  const [pid, productId] = String(pay.external_reference || '').split('.');
  const it = Sim.ECON.IAP[productId];
  if (!pid || !it) return null;
  if (Number(pay.transaction_amount) + 0.001 < it.brl) { console.warn('[mp] valor menor que o preço', pay.id); return null; }
  const token = 'mp:' + pay.id;
  await store.insertPurchase({ token, player: pid, product: productId, order_id: 'mp:' + pay.id, state: 'pending', provider: 'mercadopago', amount: pay.transaction_amount });
  const out = await deliver(token, pid, productId);
  if (out) console.log('[mp] pagamento aprovado', pay.id, productId);
  return out;
}
// O jogo pergunta de tempos em tempos: "já pagou?"
app.get('/api/pay/check', auth, wrap(async (req, res) => {
  const ref = String(req.query.ref || '');
  if (!ref.startsWith(req.pid + '.')) return res.status(400).json({ error: 'Referência inválida' });
  let paid = false, status = 'pending';
  try {
    for (const pay of await mp.findByRef(ref)) {
      status = pay.status === 'approved' ? 'approved' : status;
      if (pay.status === 'approved') { await settleMpPayment(pay); paid = true; }
      const tok = await store.getPurchase('mp:' + pay.id); if (tok && tok.state === 'ok') paid = true;
    }
  } catch (e) { console.warn('[mp] check', e.message); }
  send(res, await mutate(req.pid, () => ({ ok: true, paid, status })));
}));
// Aviso automático do Mercado Pago quando o pagamento é aprovado
app.post('/api/pay/mp-webhook', wrap(async (req, res) => {
  const id = (req.body && req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
  if (id && (req.body.type === 'payment' || req.query.type === 'payment' || req.query.topic === 'payment')) {
    try { await settleMpPayment(await mp.getPayment(id)); } catch (e) { console.warn('[mp] webhook', e.message); }
  }
  res.sendStatus(200);
}));
if (mp.DEV_FAKE) app.post('/api/pay/dev-approve/:id', (req, res) => res.json({ ok: mp.devApprove(req.params.id) }));   // só em teste local

// Reembolsos do Google Play: confere a cada 6h e retira as gemas
async function checkRefunds() {
  try {
    for (const v of await play.listVoided()) {
      const pur = await store.getPurchase('gp:' + v.purchaseToken);
      if (!pur || !(await store.swapPurchaseState(pur.token, 'ok', 'refunded'))) continue;
      await mutate(pur.player, (p) => { Eco.revokeIap(p, pur.product); return { ok: true }; });
      console.log('[iap] reembolso retirado', pur.player, pur.product);
    }
  } catch (e) { console.warn('[iap] checkRefunds:', e.message); }
}
if (play.enabled) setInterval(checkRefunds, 6 * 3600000);

// O próprio servidor entrega o JOGO (site): pasta client/www
app.use(express.static(path.join(__dirname, '..', 'client', 'www'), { maxAge: PROD ? '1h' : 0 }));

if (require.main === module) ready.then(() => app.listen(PORT, () => console.log(`Servidor na porta ${PORT} · banco: ${store.kind}${play.enabled ? '' : ' · Google Play não configurado'}${mp.enabled ? ' · Mercado Pago OK' : ''}`)), (e) => { console.error('Falha no banco de dados:', e.message); process.exit(1); });
module.exports = { app, db: store.raw, store, ready };
