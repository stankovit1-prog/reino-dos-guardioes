// Teste ponta a ponta: sobe o servidor, cria conta, joga, tenta trapacear, compra.
process.env.IAP_DEV_FAKE='1'; process.env.DB_PATH=':memory:'; process.env.PORT='0';
const {app, db} = require('../server/server.js');
const play = require('./bot.js');
const srv = app.listen(0, async () => {
  const base = 'http://127.0.0.1:'+srv.address().port;
  let tok;
  const call = async (p, b) => { const r = await fetch(base+p,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{})},body:b?JSON.stringify(b):undefined}); return r.json(); };
  const ok = (c,m)=>{console.log((c?'✅ ':'❌ ')+m); if(!c) process.exitCode=1;};
  const g = await call('/api/auth/guest',{deviceId:'a'.repeat(40)}); tok=g.token;
  ok(g.player.coins===200 && g.player.gems===20, 'conta criada (200 moedas, 20 gemas)');
  ok((await call('/api/level/start',{level:5})).error, 'não pode pular fase');
  // jogo legítimo
  let st = await call('/api/level/start',{level:1});
  const r = play(1, st.cfg.perm, st.cfg.unlocked, { loadout: st.cfg.loadout });
  db.prepare('UPDATE runs SET started = started - 600000 WHERE id=?').run(st.runId); // simula 10 min jogados
  let f = await call('/api/level/finish',{runId:st.runId, actions:r.actions});
  ok(f.ok && f.status==='won' && f.coins>0 && f.player.maxLevel===1, 'vitória validada pelo servidor: +'+f.coins+' moedas, '+f.stars+'★');
  ok((await call('/api/level/finish',{runId:st.runId, actions:r.actions})).error, 'não dá pra enviar a mesma vitória 2x');
  // trapaça: speed hack
  st = await call('/api/level/start',{level:2});
  f = await call('/api/level/finish',{runId:st.runId, actions:play(2, st.cfg.perm, st.cfg.unlocked, { loadout: st.cfg.loadout }).actions});
  ok(f.error && /rápida/.test(f.error), 'speed-hack bloqueado: '+f.error);
  // trapaça: ouro infinito (ações impossíveis)
  st = await call('/api/level/start',{level:2});
  db.prepare('UPDATE runs SET started = started - 600000 WHERE id=?').run(st.runId);
  const fake = []; for (let i=0;i<9;i++) fake.push({t:0,a:'build',x:i,y:13,k:'canhao'});
  f = await call('/api/level/finish',{runId:st.runId, actions:fake});
  ok(f.error && /inválida/.test(f.error), 'ouro falso bloqueado: '+f.error);
  // trapaça: torre premium sem comprar
  ok((await call('/api/shop/buy',{item:'dragao'})).error, 'não compra dragão sem gemas');
  // compra (modo teste)
  const g0 = (await call('/api/me')).player.gems;
  let p = await call('/api/iap/verify',{productId:'gemas_g',purchaseToken:'teste_abc123456'});
  ok(p.ok && p.player.gems===g0+700, 'compra aprovada: '+g0+'+700 = '+p.player.gems+' gemas');
  p = await call('/api/iap/verify',{productId:'gemas_g',purchaseToken:'teste_abc123456'});
  ok(p.player.gems===g0+700, 'mesmo recibo não dá gemas 2x');
  ok((await call('/api/iap/verify',{productId:'gemas_mini',purchaseToken:'falso_123456789'})).error, 'recibo falso recusado');
  p = await call('/api/shop/buy',{item:'dragao'});
  ok(p.ok && p.player.unlocked.includes('dragao') && p.player.gems===g0+475, 'dragão liberado com gemas');
  p = await call('/api/upgrade',{tower:'arqueiro'}); ok((p.ok && p.player.perm.arqueiro===1) || /Cartas insuficientes/.test(p.error), 'melhoria exige cartas: ' + (p.ok ? 'ok' : p.error));
  p = await call('/api/daily/claim',{}); ok(p.ok, 'recompensa diária'); ok((await call('/api/daily/claim',{})).error, 'diária só 1x por dia');
  for (let i=0;i<12;i++) await call('/api/level/start',{level:1});
  ok((await call('/api/level/start',{level:1})).error==='Sem energia', 'energia acaba');
  // fase secreta + tesouros
  const pid = g.playerId;
  const row = db.prepare('SELECT data FROM players WHERE id=?').get(pid); const pd = JSON.parse(row.data); pd.maxLevel = 10; pd.energy = 10; pd.coins=0;
  db.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(pd), pid);
  ok((await call('/api/level/start',{level:7,bonus:true})).error, 'fase secreta trancada antes de achar');
  st = await call('/api/level/start',{level:7});
  db.prepare('UPDATE runs SET started = started - 3600000 WHERE id=?').run(st.runId);
  const rr = play(7, st.cfg.perm, st.cfg.unlocked, {secret:true, treasure:true, trap:true, loadout: st.cfg.loadout});
  f = await call('/api/level/finish',{runId:st.runId, actions:rr.actions});
  ok(f.ok && f.secret === true, 'lugar misterioso achado -> fase secreta liberada');
  st = await call('/api/level/start',{level:7,bonus:true});
  ok(st.ok && st.cfg.bonus, 'entrou na fase secreta (sem gastar energia)');
  db.prepare('UPDATE runs SET started = started - 3600000 WHERE id=?').run(st.runId);
  const rb = play(7, st.cfg.perm, st.cfg.unlocked, {bonus:true, loadout: st.cfg.loadout});
  f = await call('/api/level/finish',{runId:st.runId, actions:rb.actions});
  ok(f.ok && f.bonus && f.coins > 0 && f.gems > 0, 'recompensa da fase secreta: +'+f.coins+' moedas, +'+f.gems+' gemas ('+f.kills+'/'+f.total+' ladrões)');
  ok((await call('/api/level/start',{level:7,bonus:true})).error, 'fase secreta só 1 vez');
  // baús e cartas
  let ch = await call('/api/chest/open',{type:'madeira'});
  ok(ch.ok && ch.cards.length > 0, 'baú grátis aberto: ' + ch.cards.map(c=>c.n+'x '+c.k).join(', '));
  ok((await call('/api/chest/open',{type:'madeira'})).error, 'baú grátis só a cada 4h');
  ok((await call('/api/chest/open',{type:'divino'})).error, 'baú dos deuses trancado em fase baixa / sem gemas');
  const before = (await call('/api/me')).player.gems;
  ch = await call('/api/chest/open',{type:'prata'});
  ok(ch.ok && ch.player.gems === before - 12 + ch.gems && ch.cards.reduce((a,c)=>a+c.n,0) === 14, 'baú de prata comprado com 12 gemas: 14 cartas');
  const pl = ch.player; const k = Object.keys(pl.cards).find(t => pl.cards[t] > 0 && pl.owned.includes(t));
  const up = await call('/api/upgrade',{tower:k});
  ok(up.ok || /Cartas insuficientes|Moedas/.test(up.error), 'melhoria usa cartas: ' + (up.ok ? 'subiu ' + k : up.error));
  // relíquia -> arma secreta (fase 25)
  const pr = JSON.parse(db.prepare('SELECT data FROM players WHERE id=?').get(pid).data); pr.maxLevel = 30; pr.energy = 10; pr.perm = {arqueiro:10,canhao:10,gelo:10,lanceiro:10,mago:10};
  db.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(pr), pid);
  st = await call('/api/level/start',{level:25});
  db.prepare('UPDATE runs SET started = started - 7200000 WHERE id=?').run(st.runId);
  const rl = play(25, st.cfg.perm, st.cfg.unlocked, {relic:true, loadout: st.cfg.loadout});
  f = await call('/api/level/finish',{runId:st.runId, actions:rl.actions});
  ok(f.ok && (f.status !== 'won' || (f.relicWeapon && f.player.owned.includes(f.relicWeapon.k))), 'relíquia achada: ' + (f.relicWeapon ? 'ganhou a arma secreta ' + f.relicWeapon.k : 'robô perdeu a fase (' + f.status + ')'));
  // baú com moedas
  const pdc = JSON.parse(db.prepare('SELECT data FROM players WHERE id=?').get(pid).data); pdc.coins = 5000; db.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(pdc), pid);
  ch = await call('/api/chest/open',{type:'prata', pay:'coins'});
  ok(ch.ok && ch.player.coins < 5000 + 400, 'baú de prata comprado com 500 moedas (veio: ' + ch.gold + ' moedas' + (ch.gems ? ', ' + ch.gems + ' gemas' : '') + (ch.energy ? ', ' + ch.energy + ' energia' : '') + ')');
  ok((await call('/api/chest/open',{type:'divino', pay:'coins'})).error, 'baú dos deuses não sai com moedas');
  let of = await call('/api/offer/buy',{i:0});
  ok(of.ok && of.cards[0].n === 12, 'cartas do dia: comprou ' + of.cards[0].n + ' cartas por 180 moedas');
  ok((await call('/api/offer/buy',{i:0})).error, 'cada oferta só 1 vez por dia');
  // outra conta usando token alheio
  tok = (await call('/api/auth/guest',{deviceId:'b'.repeat(40)})).token;
  ok((await call('/api/iap/verify',{productId:'gemas_g',purchaseToken:'teste_abc123456'})).error, 'recibo de outra conta recusado');
  srv.close();
});
