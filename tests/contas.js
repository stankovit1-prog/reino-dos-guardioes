// Testa: código de recuperação (mesma conta em outro aparelho), PIX no site (entrega 1 vez só) e banco Postgres.
process.env.IAP_DEV_FAKE = '1'; process.env.DB_PATH = ':memory:';
const { app } = require('../server/server.js');
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };

const srv = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const mk = () => { let tok; return async (p, b, m) => { const r = await fetch(base + p, { method: m || (b ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (j.token) tok = j.token; return j; }; };

  // Celular 1 joga e compra
  const c1 = mk();
  const a = await c1('/api/auth/guest', { deviceId: '1'.repeat(40) });
  const code = (await c1('/api/account/code', {})).code;
  ok(/^RG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), 'código de recuperação gerado: ' + code);

  // compra por PIX no site
  const pix = await c1('/api/pay/create', { productId: 'gemas_p', email: 'jogador@exemplo.com' });
  ok(pix.ok && pix.qr && pix.ref, 'PIX criado (copia e cola recebido)');
  let chk = await c1('/api/pay/check?ref=' + encodeURIComponent(pix.ref));
  ok(chk.ok && !chk.paid && chk.player.gems === a.player.gems, 'antes de pagar: nenhuma gema entregue');
  await fetch(base + '/api/pay/dev-approve/' + pix.devId, { method: 'POST' });
  chk = await c1('/api/pay/check?ref=' + encodeURIComponent(pix.ref));
  ok(chk.paid && chk.player.gems === a.player.gems + 130, 'PIX aprovado: +130 gemas entregues');
  chk = await c1('/api/pay/check?ref=' + encodeURIComponent(pix.ref));
  ok(chk.player.gems === a.player.gems + 130, 'conferir de novo NÃO entrega gemas 2 vezes');
  const r1 = await c1('/api/pay/check?ref=' + encodeURIComponent('outra-conta.gemas_p.x'));
  ok(r1.error, 'não dá para conferir pagamento de outra conta');

  // Celular 2 (novo aparelho) recupera a conta com o código
  const c2 = mk();
  const g2 = await c2('/api/auth/guest', { deviceId: '2'.repeat(40) });
  ok(g2.playerId !== a.playerId, 'celular novo começa como outra conta');
  const rec = await c2('/api/auth/recover', { code: code.toLowerCase().replace(/-/g, ' '), deviceId: '2'.repeat(40) });
  ok(rec.playerId === a.playerId && rec.player.gems === a.player.gems + 130, 'código de recuperação: mesma conta, compras mantidas');
  const again = await mk()('/api/auth/guest', { deviceId: '2'.repeat(40) });
  ok(again.playerId === a.playerId, 'o celular novo continua ligado à conta recuperada');
  ok((await mk()('/api/auth/recover', { code: 'RG-AAAA-BBBB-CCCC' })).error, 'código errado recusado');
  const acc = await c2('/api/account');
  ok(acc.hasCode && acc.purchases.length === 1 && acc.purchases[0].provider === 'mercadopago', 'histórico de compras guardado na conta');
  ok((await c2('/api/auth/google', { idToken: 'x' })).error, 'login Google exige configuração no servidor');

  // ---------- Postgres (simulado em memória) ----------
  const { newDb } = require('../server/node_modules/pg-mem');
  const { pgStore } = require('../server/db.js');
  const { Pool } = newDb().adapters.createPg();
  const st = pgStore(new Pool());
  await st.init();
  await st.createPlayer('p1', { gems: 0 });
  await st.setIdentity('code', 'h1', 'p1');
  ok(await st.findIdentity('code', 'h1') === 'p1', 'Postgres: identidade salva');
  const w = await st.withPlayer('p1', (p) => { p.gems += 50; return { ok: true }; });
  ok(w.__p.gems === 50 && (await st.getPlayer('p1')).data.gems === 50, 'Postgres: progresso salvo em transação');
  ok(await st.insertPurchase({ token: 't1', player: 'p1', product: 'gemas_p', state: 'pending', provider: 'mercadopago' }), 'Postgres: compra registrada');
  ok(!(await st.insertPurchase({ token: 't1', player: 'p1', product: 'gemas_p', state: 'pending', provider: 'mercadopago' })), 'Postgres: mesma compra não duplica');
  ok(await st.swapPurchaseState('t1', 'pending', 'ok') && !(await st.swapPurchaseState('t1', 'pending', 'ok')), 'Postgres: entrega acontece 1 vez só');
  await st.insertRun('r1', 'p1', { level: 1 });
  ok((await st.takeRun('r1', 'p1')) && !(await st.takeRun('r1', 'p1')), 'Postgres: partida só é finalizada 1 vez');
  srv.close();
});
