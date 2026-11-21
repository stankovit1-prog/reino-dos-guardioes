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
// PROTEÇÃO CONTRA PERDA DE DADOS: em produção o servidor SÓ liga com o banco na nuvem (Neon).
// Sem ele, preferimos não abrir o jogo a usar um arquivo temporário que seria apagado no reinício.
if (PROD && !process.env.DATABASE_URL) { console.error('DATABASE_URL não definido: o servidor não vai ligar para não perder contas.'); process.exit(1); }
// IDs de cliente OAuth do Google (web e Android), separados por vírgula
const GOOGLE_CLIENT_IDS = (process.env.GOOGLE_CLIENT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const googleAuth = new OAuth2Client();
const secureRand = () => crypto.randomInt(0, 1000000000) / 1000000000;

const store = createStore();
const ready = store.init().then(loadLive);
// Salas multiplayer cooperativas temporárias; não alteram nem substituem dados das contas.
const multiRooms = new Map();

// ---------- USUÁRIO MESTRE ----------
// Somente contas autenticadas com um Gmail listado em ADMIN_EMAILS recebem acesso ao painel.
// O acesso por ADMIN_IDS foi desativado: não basta conhecer ou copiar um ID de jogador.
const envList = (k) => (process.env[k] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
// O painel do mestre só é liberado após autenticação com um dos e-mails Google autorizados.
const isAdmin = (_pid, data) => !!data && !!data.email && envList('ADMIN_EMAILS').includes(String(data.email).trim().toLowerCase());

// ---------- CONFIGURAÇÕES AO VIVO (o mestre muda pelo painel, sem atualizar o app) ----------
const LIVE_DEFAULT = { coinMul: 1, gemMul: 1, news: '', maint: false, gift: null };
let LIVE = Object.assign({}, LIVE_DEFAULT);
async function loadLive() { LIVE = Object.assign({}, LIVE_DEFAULT, (await store.getSetting('live')) || {}); }

// Executa uma alteração no jogador de forma atômica e devolve a visão pública
async function mutate(id, fn) {
  const out = await store.withPlayer(id, (p, r) => { Eco.migrate(p, Date.now()); return fn(p, r); });
  const p = out.__p; delete out.__p;
  if (p) out.player = Eco.publicView(p, Date.now());
  return out;
}
const send = (res, out) => res.status(out.error ? 400 : 200).json(out);
const wrap = (fn) => (req, res) => fn(req, res).catch(e => { console.error('[erro]', e); res.status(500).json({ error: 'Erro no servidor, tente de novo' }); });
const tokenFor = (pid) => jwt.sign({ sub: pid }, SECRET, { expiresIn: '180d' });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const authCodeHash = (s) => crypto.createHmac('sha256', SECRET).update(String(s)).digest('hex');
const passwordHash = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt:' + salt + ':' + crypto.scryptSync(String(password), salt, 64).toString('hex');
};
const passwordMatches = (password, encoded) => {
  if (typeof encoded !== 'string') return false;
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const expected = Buffer.from(parts[2], 'hex');
    const actual = crypto.scryptSync(String(password), parts[1], 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (e) { return false; }
};
const normalizeEmail = (v) => String(v || '').trim().toLowerCase();
const validEmail = (v) => { const p = v.split('@'); return v.length <= 254 && p.length === 2 && p[0].length > 0 && p[1].includes('.') && !v.includes(' ') && !v.includes('..'); };
const normalizePhone = (v) => '+' + String(v || '').replace(/[^0-9]/g, '');
const validPhone = (v) => { const d = v.slice(1); return v[0] === '+' && d.length >= 8 && d.length <= 15 && /^[1-9][0-9]+$/.test(d); };
async function deliverAuthCode(channel, to, code, purpose) {
  const url = process.env.AUTH_DELIVERY_URL, token = process.env.AUTH_DELIVERY_TOKEN;
  if (!url || !token) return false;
  const deliveryUrl = new URL(url);
  if (PROD && deliveryUrl.protocol !== 'https:') return false;
  const response = await fetch(deliveryUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ channel, to, code, purpose, subject: 'Reino dos Guardiões - código de segurança',
      message: 'Seu código do Reino dos Guardiões é ' + code + '. Ele expira em 10 minutos. Se você não solicitou, ignore esta mensagem.' }),
    signal: AbortSignal.timeout(8000) });
  return response.ok;
}
async function issueAuthChallenge(kind, target, player) {
  if (!process.env.AUTH_DELIVERY_URL || !process.env.AUTH_DELIVERY_TOKEN) return { error: 'Envio de e-mail/SMS ainda não configurado no servidor.' };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const id = crypto.randomUUID();
  const channel = kind === 'phone_link' || (kind === 'password_recovery' && target.startsWith('+')) ? 'sms' : 'email';
  const sent = await deliverAuthCode(channel, target, code, kind);
  if (!sent) return { error: 'Não foi possível enviar o código. Tente novamente mais tarde.' };
  await store.createChallenge({ id, kind, target, player, secretHash: authCodeHash(code), expires: Date.now() + 10 * 60 * 1000 });
  return { ok: true, challengeId: id, channel };
}
async function verifyAuthChallenge(id, code, kind) {
  const row = await store.getChallenge(String(id || ''));
  if (!row || row.kind !== kind || Number(row.expires) < Date.now() || Number(row.attempts) >= 5) {
    if (row) await store.deleteChallenge(row.id);
    return null;
  }
  const a = Buffer.from(row.secret_hash, 'hex'), b = Buffer.from(authCodeHash(String(code || '').trim()), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const attempts = Number(row.attempts) + 1;
    if (attempts >= 5) await store.deleteChallenge(row.id); else await store.updateChallengeAttempts(row.id, attempts);
    return null;
  }
  return row;
}
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
// Ao entrar: entrega presente do mestre (1x por conta), aviso do dia e marca se é o mestre
async function welcome(pid) {
  const out = await mutate(pid, (p) => {
    const r = { ok: true };
    const g = LIVE.gift;
    if (g && g.id && p.giftSeen !== g.id) {
      p.giftSeen = g.id; p.coins += g.coins | 0; p.gems += g.gems | 0;
      r.gift = { coins: g.coins | 0, gems: g.gems | 0, msg: g.msg || '' };
    }
    if (isAdmin(pid, p)) r.isAdmin = true;
    return r;
  });
  if (LIVE.news) out.news = LIVE.news;
  return out;
}
async function loginResponse(pid, extra) {
  const row = await store.getPlayer(pid);
  if (row.banned) return { error: 'Conta suspensa' };
  return Object.assign(await welcome(pid), { token: tokenFor(pid), playerId: pid }, extra || {});
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


/* 3) E-mail e senha: o cadastro confirma o e-mail antes de vincular a identidade. */
app.post('/api/auth/email/start', auth, rateLimit({ windowMs: 3600000, limit: 5 }), wrap(async (req, res) => {
  const email = normalizeEmail(req.body.email), password = String(req.body.password || '');
  if (!validEmail(email) || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Informe um e-mail válido e uma senha de 10 a 128 caracteres.' });
  if (await store.findIdentity('email', email)) return res.status(409).json({ error: 'Este e-mail já está cadastrado. Use Entrar ou Recuperar senha.' });
  const out = await issueAuthChallenge('email_register', email, req.pid);
  if (out.error) return res.status(503).json(out);
  await store.setSetting('auth_pending:' + out.challengeId, { passwordHash: passwordHash(password) });
  res.json({ ok: true, challengeId: out.challengeId, channel: 'email' });
}));
app.post('/api/auth/email/verify', rateLimit({ windowMs: 3600000, limit: 10 }), wrap(async (req, res) => {
  const row = await verifyAuthChallenge(req.body.challengeId, req.body.code, 'email_register');
  if (!row) return res.status(400).json({ error: 'Código inválido ou expirado. Solicite outro código.' });
  const pending = await store.getSetting('auth_pending:' + row.id);
  if (!pending || await store.findIdentity('email', row.target)) return res.status(400).json({ error: 'Cadastro não pode ser concluído. Inicie novamente.' });
  await store.setIdentity('email', row.target, row.player);
  await store.withPlayer(row.player, p => { p.email = row.target; p.passwordHash = pending.passwordHash; return { ok: true }; });
  await store.deleteChallenge(row.id);
  await store.setSetting('auth_pending:' + row.id, null);
  const device = String(req.body.deviceId || '');
  if (validDevice(device)) await store.setIdentity('device', device, row.player);
  send(res, await loginResponse(row.player, { linked: true }));
}));
app.post('/api/auth/email/login', rateLimit({ windowMs: 3600000, limit: 15 }), wrap(async (req, res) => {
  const email = normalizeEmail(req.body.email), pid = await store.findIdentity('email', email);
  const row = pid && await store.getPlayer(pid);
  if (!row || !passwordMatches(req.body.password || '', row.data.passwordHash)) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  const device = String(req.body.deviceId || '');
  if (validDevice(device)) await store.setIdentity('device', device, pid);
  send(res, await loginResponse(pid));
}));
app.post('/api/auth/recovery/start', rateLimit({ windowMs: 3600000, limit: 5 }), wrap(async (req, res) => {
  const channel = req.body.channel === 'sms' ? 'sms' : 'email';
  const target = channel === 'sms' ? normalizePhone(req.body.phone) : normalizeEmail(req.body.email);
  if (channel === 'sms' ? !validPhone(target) : !validEmail(target)) return res.status(400).json({ error: 'Informe um contato válido.' });
  if (!process.env.AUTH_DELIVERY_URL || !process.env.AUTH_DELIVERY_TOKEN) return res.status(503).json({ error: 'Envio de e-mail/SMS ainda não configurado no servidor.' });
  const pid = await store.findIdentity(channel === 'sms' ? 'phone' : 'email', target);
  if (pid) {
    const out = await issueAuthChallenge('password_recovery', target, pid);
    if (out.error) return res.status(503).json(out);
    return res.json({ ok: true, challengeId: out.challengeId, channel });
  }
  res.json({ ok: true });
}));
app.post('/api/auth/recovery/verify', rateLimit({ windowMs: 3600000, limit: 10 }), wrap(async (req, res) => {
  const row = await verifyAuthChallenge(req.body.challengeId, req.body.code, 'password_recovery');
  const password = String(req.body.password || '');
  if (!row || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Código inválido/expirado ou senha fora do padrão (10 a 128 caracteres).' });
  const updated = await store.withPlayer(row.player, p => { p.passwordHash = passwordHash(password); return { ok: true }; });
  if (updated.error) return send(res, updated);
  await store.deleteChallenge(row.id);
  const device = String(req.body.deviceId || '');
  if (validDevice(device)) await store.setIdentity('device', device, row.player);
  send(res, await loginResponse(row.player, { recovered: true }));
}));
app.post('/api/account/phone/start', auth, rateLimit({ windowMs: 3600000, limit: 3 }), wrap(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!validPhone(phone)) return res.status(400).json({ error: 'Informe o telefone com código do país. Ex.: +5511999999999' });
  const owner = await store.findIdentity('phone', phone);
  if (owner && owner !== req.pid) return res.status(409).json({ error: 'Este telefone já está vinculado a outra conta.' });
  const out = await issueAuthChallenge('phone_link', phone, req.pid);
  send(res, out);
}));
app.post('/api/account/phone/verify', auth, rateLimit({ windowMs: 3600000, limit: 8 }), wrap(async (req, res) => {
  const row = await verifyAuthChallenge(req.body.challengeId, req.body.code, 'phone_link');
  if (!row || row.player !== req.pid) return res.status(400).json({ error: 'Código inválido ou expirado.' });
  const owner = await store.findIdentity('phone', row.target);
  if (owner && owner !== req.pid) return res.status(409).json({ error: 'Este telefone já está vinculado a outra conta.' });
  await store.setIdentity('phone', row.target, req.pid);
  await store.withPlayer(req.pid, p => { p.phone = row.target; return { ok: true }; });
  await store.deleteChallenge(row.id);
  res.json({ ok: true, phone: row.target });
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
  res.json({ ok: true, id: req.pid, google: ids.some(i => i.kind === 'google') ? (row.data.email || 'conectado') : null, hasCode: ids.some(i => i.kind === 'code'), emailLogin: ids.some(i => i.kind === 'email'), email: ids.some(i => i.kind === 'email') ? row.data.email : null, hasPhone: ids.some(i => i.kind === 'phone'),
    purchases: (await store.purchasesOf(req.pid)).map(x => ({ product: x.product, at: Number(x.at), state: x.state, provider: x.provider })) });
}));

// =================== MULTIPLAYER COOPERATIVO ===================
const MULTI_CAPACITY = 4;
const MULTI_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function pruneMultiRooms() {
  const now = Date.now();
  for (const [code, room] of multiRooms) {
    const ttl = room.status === 'playing' ? 90000 : room.status === 'waiting' ? 1800000 : 600000;
    if (now - room.updatedAt > ttl) multiRooms.delete(code);
  }
}
function newMultiCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += MULTI_ALPHABET[crypto.randomInt(0, MULTI_ALPHABET.length)];
  } while (multiRooms.has(code));
  return code;
}
function multiMember(room, pid) {
  return room.players.find(p => p.pid === pid && !p.left) || null;
}
function multiPublic(room, pid) {
  const member = multiMember(room, pid);
  const out = {
    ok: true,
    room: {
      code: room.code, status: room.status, level: room.level || null,
      maxPlayers: MULTI_CAPACITY, isHost: pid === room.hostPid,
      players: room.players.filter(p => !p.left).map(p => ({
        name: p.name, isHost: p.pid === room.hostPid
      }))
    },
    cfg: room.cfg || null,
    runId: member ? member.runId : null,
    snapshot: room.snapshot || null,
    result: room.result || null
  };
  if (pid === room.hostPid) out.actions = room.actions;
  return out;
}
async function multiPlayerView(pid) {
  const row = await store.getPlayer(pid);
  return row ? Eco.publicView(row.data, Date.now()) : null;
}

app.get('/api/multi/rooms', auth, wrap(async (req, res) => {
  pruneMultiRooms();
  const rooms = Array.from(multiRooms.values()).filter(r =>
    r.status === 'waiting' && r.players.filter(p => !p.left).length < MULTI_CAPACITY
  ).map(r => ({
    code: r.code,
    host: r.players.find(p => p.pid === r.hostPid)?.name || 'Guardião',
    players: r.players.filter(p => !p.left).length,
    maxPlayers: MULTI_CAPACITY
  }));
  res.json({ ok: true, rooms });
}));

app.post('/api/multi/create', auth, wrap(async (req, res) => {
  pruneMultiRooms();
  const row = await store.getPlayer(req.pid);
  const code = newMultiCode();
  const name = String(row && row.data.name || 'Guardião').replace(/[<>&"]/g, '').slice(0, 16);
  const room = {
    code, hostPid: req.pid, status: 'waiting', level: null, cfg: null,
    players: [{ pid: req.pid, name, runId: null, left: false }],
    queue: [], nextSeq: 0, actions: [], snapshot: null, result: null, updatedAt: Date.now()
  };
  multiRooms.set(code, room);
  res.json(multiPublic(room, req.pid));
}));

app.post('/api/multi/join', auth, wrap(async (req, res) => {
  pruneMultiRooms();
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = multiRooms.get(code);
  if (!room) return res.status(404).json({ error: 'Sala não encontrada. Confira o código.' });
  if (room.status !== 'waiting') return res.status(400).json({ error: 'Essa batalha já começou.' });
  let member = multiMember(room, req.pid);
  if (!member && room.players.filter(p => !p.left).length >= MULTI_CAPACITY) {
    return res.status(400).json({ error: 'Sala cheia. O máximo é 4 jogadores.' });
  }
  if (!member) {
    const row = await store.getPlayer(req.pid);
    const name = String(row && row.data.name || 'Guardião').replace(/[<>&"]/g, '').slice(0, 16);
    member = { pid: req.pid, name, runId: null, left: false };
    room.players.push(member);
  }
  room.updatedAt = Date.now();
  res.json(multiPublic(room, req.pid));
}));

app.get('/api/multi/state', auth, wrap(async (req, res) => {
  pruneMultiRooms();
  const code = String(req.query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = multiRooms.get(code);
  if (!room || !multiMember(room, req.pid)) return res.status(404).json({ error: 'Você não está nessa sala.' });
  room.updatedAt = Date.now();
  const out = multiPublic(room, req.pid);
  out.player = await multiPlayerView(req.pid);
  res.json(out);
}));

app.post('/api/multi/start', auth, wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = multiRooms.get(code);
  if (!room || !multiMember(room, req.pid)) return res.status(404).json({ error: 'Sala não encontrada.' });
  if (room.hostPid !== req.pid) return res.status(403).json({ error: 'Somente o líder pode iniciar a batalha.' });
  if (room.status !== 'waiting') return res.status(400).json({ error: 'A sala já foi iniciada.' });
  const members = room.players.filter(p => !p.left);
  if (members.length < 2) return res.status(400).json({ error: 'Convide pelo menos mais um jogador para começar.' });
  const level = Number(req.body.level);
  if (!Number.isInteger(level) || level < 1) return res.status(400).json({ error: 'Fase inválida.' });
  const now = Date.now();
  let sharedCfg = null;
  // Valida fase e energia de todos antes de cobrar energia de qualquer conta.
  for (const member of members) {
    const row = await store.getPlayer(member.pid);
    if (!row || row.banned) return res.status(400).json({ error: 'Um dos jogadores não pode participar desta sala.' });
    const preview = JSON.parse(JSON.stringify(row.data));
    Eco.migrate(preview, now);
    const check = Eco.startLevel(preview, level, now, false, undefined);
    if (check.error) return res.status(400).json({ error: member.name + ': ' + check.error });
    if (member.pid === room.hostPid) sharedCfg = check.cfg;
  }
  for (const member of members) {
    const spent = await mutate(member.pid, p => Eco.startLevel(p, level, Date.now(), false, undefined));
    if (spent.error) return res.status(400).json({ error: member.name + ': ' + spent.error });
    member.runId = crypto.randomUUID();
    await store.insertRun(member.runId, member.pid, sharedCfg);
  }
  room.status = 'playing';
  room.level = level;
  room.cfg = sharedCfg;
  room.queue = [];
  room.nextSeq = 0;
  room.actions = [];
  room.snapshot = null;
  room.result = null;
  room.updatedAt = Date.now();
  const out = multiPublic(room, req.pid);
  out.player = await multiPlayerView(req.pid);
  res.json(out);
}));

app.post('/api/multi/action', auth, wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = multiRooms.get(code);
  const member = room && multiMember(room, req.pid);
  if (!room || !member || room.status !== 'playing') {
    return res.status(400).json({ error: 'A batalha não está recebendo comandos.' });
  }
  const raw = req.body.action;
  const allowed = ['build', 'up', 'sell', 'repair', 'wave', 'trap', 'open', 'secret', 'relic'];
  if (!raw || typeof raw !== 'object' || !allowed.includes(raw.a)) {
    return res.status(400).json({ error: 'Comando de jogo inválido.' });
  }
  const action = { a: raw.a };
  if (['build', 'trap', 'open', 'secret', 'relic'].includes(raw.a)) {
    action.x = Number(raw.x);
    action.y = Number(raw.y);
    if (!Number.isInteger(action.x) || !Number.isInteger(action.y) ||
        action.x < 0 || action.x >= Sim.COLS || action.y < 0 || action.y >= Sim.ROWS) {
      return res.status(400).json({ error: 'Posição inválida.' });
    }
  }
  if (raw.a === 'build' || raw.a === 'trap') {
    action.k = String(raw.k || '').slice(0, 40);
    if (!/^[a-z0-9_]+$/.test(action.k)) return res.status(400).json({ error: 'Item inválido.' });
  }
  if (['up', 'sell', 'repair'].includes(raw.a)) {
    action.id = Number(raw.id);
    if (!Number.isInteger(action.id) || action.id < 1) return res.status(400).json({ error: 'Alvo inválido.' });
  }
  if (room.queue.length >= 100) return res.status(429).json({ error: 'Muitos comandos pendentes. Aguarde um instante.' });
  room.queue.push({ seq: ++room.nextSeq, name: member.name, action });
  room.updatedAt = Date.now();
  res.json({ ok: true, queued: true });
}));

app.post('/api/multi/sync', auth, wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = multiRooms.get(code);
  if (!room || room.hostPid !== req.pid || room.status !== 'playing') {
    return res.status(400).json({ error: 'O líder não está conectado à batalha.' });
  }
  const snapshot = req.body.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return res.status(400).json({ error: 'Estado da partida inválido.' });
  }
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 160000) {
    return res.status(413).json({ error: 'Estado da partida muito grande.' });
  }
  room.snapshot = snapshot;
  if (Array.isArray(req.body.actions) && req.body.actions.length <= 5000) room.actions = req.body.actions;
  const cursor = Math.max(0, Number(req.body.cursor) | 0);
  room.queue = room.queue.filter(item => item.seq > cursor);
  room.updatedAt = Date.now();
  res.json({ ok: true, requests: room.queue.slice(), cursor: room.nextSeq });
}));

app.post('/api/multi/finish', auth, wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = multiRooms.get(code);
  if (!room || room.hostPid !== req.pid || room.status !== 'playing') {
    return res.status(400).json({ error: 'Batalha não encontrada ou já encerrada.' });
  }
  const actions = req.body.actions;
  if (!Array.isArray(actions) || actions.length > 5000) return res.status(400).json({ error: 'Ações da partida inválidas.' });
  room.status = 'finishing';
  room.updatedAt = Date.now();
  let hostOut = null;
  const team = [];
  for (const member of room.players.filter(p => !p.left)) {
    const run = await store.takeRun(String(member.runId || ''), member.pid);
    if (!run) {
      team.push({ name: member.name, ok: false });
      continue;
    }
    const out = await mutate(member.pid, p => {
      const result = Eco.finishLevel(p, { cfg: run.cfg, startedAt: Number(run.started) }, actions, Date.now(), secureRand);
      if (result.ok && result.status === 'won') {
        const extraCoins = Math.floor((result.coins | 0) * (LIVE.coinMul - 1));
        const extraGems = Math.floor((result.gems | 0) * (LIVE.gemMul - 1));
        if (extraCoins > 0 || extraGems > 0) {
          p.coins += extraCoins; p.gems += extraGems;
          result.coins += extraCoins; result.gems += extraGems; result.event = true;
        }
      }
      return result;
    });
    if (out.cheat) {
      await store.addCheat(member.pid);
      console.warn('[anti-hack multiplayer]', member.pid, out.error);
    }
    team.push({ name: member.name, ok: !!out.ok, status: out.status || null, stars: out.stars || 0 });
    if (member.pid === room.hostPid) hostOut = out;
  }
  if (!hostOut || hostOut.error) {
    room.status = 'abandoned';
    room.result = { abandoned: true, won: false };
    return res.status(400).json({ error: hostOut && hostOut.error || 'Não foi possível validar a batalha da equipe.' });
  }
  room.status = 'finished';
  room.result = { won: hostOut.status === 'won', status: hostOut.status, stars: hostOut.stars || 0, team };
  room.updatedAt = Date.now();
  res.json(Object.assign({}, hostOut, { team, roomStatus: 'finished' }));
}));

app.post('/api/multi/leave', auth, wrap(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = multiRooms.get(code);
  const member = room && multiMember(room, req.pid);
  if (!room || !member) return res.json({ ok: true });
  if (room.status === 'waiting' && room.hostPid === req.pid) multiRooms.delete(code);
  else if (room.status === 'playing' && room.hostPid === req.pid) {
    room.status = 'abandoned';
    room.result = { abandoned: true, won: false };
    room.updatedAt = Date.now();
  } else {
    member.left = true;
    room.updatedAt = Date.now();
  }
  res.json({ ok: true });
}));

// =================== JOGO ===================
app.get('/api/me', auth, wrap(async (req, res) => send(res, Object.assign(await welcome(req.pid), { playerId: req.pid }))));

app.get('/api/leaderboard', wrap(async (req, res) => {
  const rows = await store.listPlayers('', 1000);
  const ranked = rows.filter(x => !x.banned).sort((a,b) => (b.maxLevel|0)-(a.maxLevel|0) || Number(a.created)-Number(b.created)).slice(0,100);
  res.json({ ok: true, players: ranked.map((p,i) => ({ rank:i+1, name:p.name || 'Guardião', level:p.maxLevel|0 })) });
}));


app.post('/api/level/start', auth, wrap(async (req, res) => {
  let cfg;
  if (LIVE.maint) { const row = await store.getPlayer(req.pid); if (!isAdmin(req.pid, row.data)) return res.status(503).json({ error: '🛠️ Jogo em manutenção. Volte em alguns minutos!' }); }
  const out = await mutate(req.pid, (p) => { const r = Eco.startLevel(p, req.body.level, Date.now(), !!req.body.bonus, req.body.loadout); if (r.error) return r; cfg = r.cfg; return { ok: true }; });
  if (out.error) return send(res, out);
  const runId = crypto.randomUUID();
  await store.insertRun(runId, req.pid, cfg);                    // só uma partida aberta por vez
  send(res, Object.assign(out, { runId, cfg }));
}));

app.post('/api/level/finish', auth, wrap(async (req, res) => {
  const run = await store.takeRun(String(req.body.runId || ''), req.pid);    // não dá pra enviar 2x
  if (!run) return res.status(400).json({ error: 'Partida não encontrada' });
  const out = await mutate(req.pid, (p) => {
    const r = Eco.finishLevel(p, { cfg: run.cfg, startedAt: Number(run.started) }, req.body.actions, Date.now(), secureRand);
    // EVENTO do mestre: moedas/gemas em dobro (ou mais) nas fases
    if (r.ok && r.status === 'won') {
      const ec = Math.floor((r.coins | 0) * (LIVE.coinMul - 1)), eg = Math.floor((r.gems | 0) * (LIVE.gemMul - 1));
      if (ec > 0 || eg > 0) { p.coins += ec; p.gems += eg; r.coins += ec; r.gems += eg; r.event = true; }
    }
    return r;
  });
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

// =================== PAINEL DO MESTRE ===================
// Para quem NÃO é o mestre, estas rotas respondem "não encontrado" (nem dá pra saber que existem).
function adminOnly(req, res, next) {
  auth(req, res, () => {
    store.getPlayer(req.pid).then(row => {
      if (!isAdmin(req.pid, row.data)) return res.status(404).json({ error: 'Não encontrado' });
      next();
    }, e => { console.error(e); res.status(500).json({ error: 'Erro no servidor' }); });
  });
}
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
const TOTAL_LEVELS = Sim.WORLDS.length * Sim.LEVELS_PER_WORLD;

app.get('/api/admin/overview', adminOnly, wrap(async (req, res) => {
  const since = Date.now() - 86400000;
  res.json({ ok: true, stats: await store.stats(since), live: LIVE, sales: await store.allPurchases(40), banco: store.kind,
    game: { worlds: Sim.WORLDS.map(w => w.name), levels: TOTAL_LEVELS, weapons: Sim.TOWER_IDS.length, chests: Object.keys(Sim.ECON.CHESTS), products: Sim.ECON.IAP } });
}));
app.get('/api/admin/players', adminOnly, wrap(async (req, res) => {
  res.json({ ok: true, players: await store.listPlayers(String(req.query.q || '').slice(0, 60), 60) });
}));
app.get('/api/admin/player/:id', adminOnly, wrap(async (req, res) => {
  const row = await store.getPlayer(String(req.params.id));
  if (!row) return res.status(404).json({ error: 'Jogador não encontrado' });
  res.json({ ok: true, id: row.id, banned: !!Number(row.banned), cheats: Number(row.cheats) | 0, created: Number(row.created), data: (() => { const safe = Object.assign({}, row.data); delete safe.passwordHash; return safe; })(),
    logins: (await store.identitiesOf(row.id)).map(i => i.kind), purchases: await store.purchasesOf(row.id) });
}));
app.post('/api/admin/player/:id', adminOnly, wrap(async (req, res) => {
  const id = String(req.params.id), b = req.body || {};
  if (!(await store.getPlayer(id))) return res.status(404).json({ error: 'Jogador não encontrado' });
  if (b.op === 'ban') { await store.setBanned(id, !!b.v); console.log('[mestre]', req.pid, 'ban', id, !!b.v); return res.json({ ok: true }); }
  const out = await mutate(id, (p) => {
    switch (b.op) {
      case 'set':          // define valores exatos
        if (b.coins !== undefined) p.coins = num(b.coins, 1e9);
        if (b.gems !== undefined) p.gems = num(b.gems, 1e9);
        if (b.energy !== undefined) { p.energy = num(b.energy, 999); p.energyAt = Date.now(); }
        if (b.maxLevel !== undefined) p.maxLevel = num(b.maxLevel, TOTAL_LEVELS);
        if (b.name) { p.name = String(b.name).replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 16) || p.name; p.nameSet = true; }
        return { ok: true };
      case 'add':          // soma (pode ser negativo para retirar)
        p.coins = Math.max(0, Math.min(1e9, p.coins + (Number(b.coins) | 0)));
        p.gems = Math.max(0, Math.min(1e9, p.gems + (Number(b.gems) | 0)));
        return { ok: true };
      case 'chest': {
        if (!Sim.ECON.CHESTS[b.type]) return { error: 'Baú inválido' };
        const n = Math.max(1, Math.min(50, Number(b.n) | 0 || 1)), got = [];
        for (let i = 0; i < n; i++) got.push(Eco.giveChest(p, b.type, secureRand));
        return { ok: true, chests: got };
      }
      case 'cards':        // dar cartas de uma arma (ou de todas)
        p.cards = p.cards || {};
        for (const k of (b.k === '*' ? Sim.TOWER_IDS : [String(b.k)])) {
          if (!Sim.TOWERS[k]) return { error: 'Arma inválida' };
          if (!Eco.owns(p, k)) p.unlocked.push(k);
          p.cards[k] = (p.cards[k] | 0) + num(b.n, 100000);
        }
        return { ok: true };
      case 'unlockAll':    // libera todas as armas e fases
        for (const k of Sim.TOWER_IDS) if (!Eco.owns(p, k)) p.unlocked.push(k);
        p.maxLevel = TOTAL_LEVELS;
        return { ok: true };
      case 'reset': {      // começa do zero (mantém nome, e-mail e compras registradas)
        const keep = { name: p.name, nameSet: p.nameSet, email: p.email, phone: p.phone, passwordHash: p.passwordHash };
        for (const k of Object.keys(p)) delete p[k];
        Object.assign(p, Eco.newPlayer(Date.now()), keep);
        return { ok: true };
      }
      default: return { error: 'Ação inválida' };
    }
  });
  console.log('[mestre]', req.pid, b.op, id);
  send(res, out);
}));
app.post('/api/admin/live', adminOnly, wrap(async (req, res) => {
  const b = req.body || {}, nx = Object.assign({}, LIVE);
  if (b.coinMul !== undefined) nx.coinMul = Math.max(1, Math.min(10, Number(b.coinMul) || 1));
  if (b.gemMul !== undefined) nx.gemMul = Math.max(1, Math.min(10, Number(b.gemMul) || 1));
  if (b.news !== undefined) nx.news = String(b.news).slice(0, 300);
  if (b.maint !== undefined) nx.maint = !!b.maint;
  if (b.gift === null) nx.gift = null;
  else if (b.gift) nx.gift = { id: crypto.randomUUID(), coins: num(b.gift.coins, 1e6), gems: num(b.gift.gems, 1e5), msg: String(b.gift.msg || '').slice(0, 120) };
  await store.setSetting('live', nx);
  LIVE = nx;
  console.log('[mestre]', req.pid, 'config ao vivo', JSON.stringify(nx));
  res.json({ ok: true, live: LIVE });
}));

// O próprio servidor entrega o JOGO (site): pasta client/www
// Atualizações chegam na hora: o navegador sempre confere se o jogo mudou (ícones podem ficar guardados)
app.use(express.static(path.join(__dirname, '..', 'client', 'www'), { setHeaders(res, file) {
  res.setHeader('Cache-Control', /\.(png|jpg|webp|svg)$/.test(file) ? 'public, max-age=604800' : 'no-cache');
} }));

if (require.main === module) ready.then(() => app.listen(PORT, () => console.log(`Servidor na porta ${PORT} · banco: ${store.kind}${play.enabled ? '' : ' · Google Play não configurado'}${mp.enabled ? ' · Mercado Pago OK' : ''}`)), (e) => { console.error('Falha no banco de dados:', e.message); process.exit(1); });
module.exports = { app, db: store.raw, store, ready };
