// Testa: painel do mestre (só o mestre acessa), eventos ao vivo, presente para todos e save à prova de atualização.
process.env.IAP_DEV_FAKE = '1'; process.env.DB_PATH = ':memory:';
const { app } = require('../server/server.js');
const Eco = require('../shared/economy.js');
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };

const srv = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const mk = () => { let tok; return async (p, b) => { const r = await fetch(base + p, { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); j.status = r.status; if (j.token) tok = j.token; return j; }; };
  const mestre = mk(), cliente = mk();
  const m = await mestre('/api/auth/guest', { deviceId: 'a'.repeat(40) });
  const c = await cliente('/api/auth/guest', { deviceId: 'b'.repeat(40) });
  ok(m.playerId !== c.playerId, 'cada cliente tem seu próprio usuário');
  ok(!m.isAdmin, 'antes de configurar ADMIN_IDS ninguém é mestre');
  process.env.ADMIN_IDS = m.playerId;
  const me = await mestre('/api/me');
  ok(me.isAdmin === true, 'conta do mestre recebe o botão do painel');
  ok(!(await cliente('/api/me')).isAdmin, 'cliente comum NÃO vê o painel');
  const neg = await cliente('/api/admin/overview');
  ok(neg.status === 404, 'cliente comum recebe "não encontrado" no painel');
  ok((await cliente('/api/admin/player/' + m.playerId, { op: 'add', coins: 999 })).status === 404, 'cliente não consegue se dar moedas pelo painel');
  ok((await mk()('/api/admin/overview')).status === 401, 'sem login: bloqueado');

  const ov = await mestre('/api/admin/overview');
  ok(ov.ok && ov.stats.players === 2 && ov.game.levels === 400, 'mestre vê resumo: 2 jogadores, 400 fases');
  const list = await mestre('/api/admin/players?q=');
  ok(list.players.length === 2, 'mestre vê todos os jogadores');
  const add = await mestre('/api/admin/player/' + m.playerId, { op: 'add', coins: 100000, gems: 10000 });
  ok(add.ok && add.player.coins === 100200 && add.player.gems === 10020, 'mestre enche o próprio saldo');
  await mestre('/api/admin/player/' + c.playerId, { op: 'set', coins: 777, maxLevel: 12, name: 'Teste' });
  const cv = await cliente('/api/me');
  ok(cv.player.coins === 777 && cv.player.maxLevel === 12 && cv.player.name === 'Teste', 'mestre altera conta de cliente');
  const ch = await mestre('/api/admin/player/' + c.playerId, { op: 'chest', type: 'ouro', n: 2 });
  ok(ch.ok && ch.chests.length === 2, 'mestre dá baús');
  await mestre('/api/admin/player/' + c.playerId, { op: 'ban', v: true });
  ok((await cliente('/api/me')).status === 403, 'mestre suspende conta');
  await mestre('/api/admin/player/' + c.playerId, { op: 'ban', v: false });
  ok((await cliente('/api/me')).ok, 'mestre reativa conta');

  await mestre('/api/admin/live', { maint: true, news: 'Moedas em dobro!', gift: { coins: 300, gems: 15, msg: 'Valeu!' } });
  const st = await cliente('/api/level/start', { level: 1 });
  ok(st.status === 503, 'manutenção bloqueia clientes');
  ok((await mestre('/api/level/start', { level: 1 })).ok, 'mestre joga mesmo em manutenção');
  const g1 = await cliente('/api/me');
  ok(g1.gift && g1.gift.gems === 15 && g1.player.coins === 777 + 300 + ch.chests.reduce((s, x) => s + x.gold, 0) && g1.news === 'Moedas em dobro!', 'presente para todos + aviso chegam ao cliente');
  const g2 = await cliente('/api/me');
  ok(!g2.gift && g2.player.coins === g1.player.coins, 'presente entregue só 1 vez');

  // SAVE À PROVA DE ATUALIZAÇÃO: conta antiga sem campos novos continua de onde parou
  const old = { coins: 50, gems: 3, maxLevel: 37, stars: { 1: 3 }, perm: { arqueiro: 4 } };
  Eco.migrate(old, Date.now());
  ok(old.maxLevel === 37 && old.coins === 50 && old.perm.arqueiro === 4 && old.cards && old.daily && old.energy > 0, 'conta antiga atualizada sem perder progresso');
  srv.close();
});
