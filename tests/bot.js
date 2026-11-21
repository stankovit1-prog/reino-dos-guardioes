const Sim = require('../shared/sim.js');
// bot simples: constrói torres perto do caminho quando tem ouro, faz upgrades
function play(level, perm={}, unlocked=[], opts={}) {
  const cfg = {level, perm, unlocked, bonus: !!opts.bonus, ...(Array.isArray(opts.loadout) ? { loadout: opts.loadout.slice(0, 6) } : {})};
  const s = Sim.createGame(cfg); const actions = [];
  let spots = [], curPart = -1;
  const calcSpots = () => { spots = [];
    for (let y=0;y<Sim.ROWS;y++) for (let x=0;x<Sim.COLS;x++) if(!s.blocked[x+','+y]) {
      let n=0; for (const [c,r] of s.path) if (Math.abs(c-x)<=2&&Math.abs(r-y)<=2) n++;
      spots.push({x,y,n});
    }
    spots.sort((a,b)=>b.n-a.n); curPart = s.part; };
  calcSpots();
  const score = k => { const t=Sim.TOWERS[k]; return t.dmg*(t.chain||1)*(t.pierce||1)*(t.splash?2:1)*(t.range>=9999?2:1)/t.cd*(100+5*(perm[k]|0))/Math.sqrt(t.cost); };
  const types = Sim.TOWER_IDS.filter(k=>Sim.canUse(s,k)).sort((a,b)=>score(b)-score(a)).slice(0,5);
  let i=0;
  const tryAct0 = a => { a.t=s.tick; if (Sim.applyAction(s,a)) { actions.push(a); return true;} return false; };
  if (opts.relic && s.relic) tryAct0({a:'relic',x:s.relic.x,y:s.relic.y});
  if (opts.secret && s.secret) tryAct0({a:'secret',x:s.secret.x,y:s.secret.y});
  if (opts.treasure) for (const t of s.treas) tryAct0({a:'open',x:t.x,y:t.y});
  if (opts.trap && s.slots[0]) tryAct0({a:'trap',x:s.slots[0].x,y:s.slots[0].y,k:'espinhos'});
  const tryAct = a => { a.t=s.tick; if (Sim.applyAction(s,a)) { actions.push(a); return true;} return false; };
  while (s.status==='playing') {
    if (s.part !== curPart) calcSpots();
    if (s.tick%10===0) {
      for (const tw of s.towers) if (tw.hp < Sim.towerMaxHp(tw) * 0.5) tryAct({a:'repair',id:tw.id});
      const k = types[i%types.length];
      const sp = spots.find(p=>!s.blocked[p.x+','+p.y]);
      if (sp && s.towers.length<12 && tryAct({a:'build',x:sp.x,y:sp.y,k})) i++;
      else for (const tw of s.towers) if (tryAct({a:'up',id:tw.id})) break;
      if (s.phase==='build' && s.tick>40) tryAct({a:'wave'});
    }
    Sim.step(s);
  }
  return {cfg, actions, status:s.status, stars:Sim.stars(s), lives:s.lives, ticks:s.tick};
}
module.exports = play;
if (require.main===module) {
  for (const L of [1,2,5,10,20,40,80]) {
    const p=Math.min(20,Math.floor(L/3)); const r = play(L, {arqueiro:p,gelo:p,canhao:p,mago:p});
    const rp = Sim.replay(r.cfg, JSON.parse(JSON.stringify(r.actions)));
    console.log('fase',L,r.status,'★'+r.stars,'vidas',r.lives,'seg',(r.ticks/20).toFixed(0),'| replay:',rp.status,rp.stars, rp.ok&&rp.status===r.status&&rp.ticks===r.ticks?'OK':'DIVERGIU '+JSON.stringify(rp));
  }
  // trapaça: inventar ouro
  const r = play(3); r.actions.splice(2,0,{t:r.actions[2].t,a:'build',x:0,y:0,k:'dragao'});
  console.log('trapaça dragão sem liberar:', JSON.stringify(Sim.replay(r.cfg,r.actions)));
}
