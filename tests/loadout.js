// Testa loadout com até seis armas: seleção persiste por fase e o simulador bloqueia as demais.
const Sim = require('../shared/sim.js');
const Eco = require('../shared/economy.js');
const ok = (condition, message) => {
  console.log((condition ? '✅ ' : '❌ ') + message);
  if (!condition) process.exitCode = 1;
};

const now = Date.now();
const p = Eco.newPlayer(now);
p.unlocked = Sim.TOWER_IDS.slice(0, 9);
const available = Eco.publicView(p, now).owned;
const selected = available.slice(0, 6);

const started = Eco.startLevel(p, 1, now, false, selected);
ok(started.ok && started.cfg.loadout.length === 6, 'jogador inicia fase com exatamente seis armas selecionadas');

const state = Sim.createGame(started.cfg);
ok(selected.every(k => Sim.canUse(state, k)), 'as seis armas escolhidas podem ser usadas na fase');
const excluded = available.filter(k => !selected.includes(k));
ok(excluded.every(k => !Sim.canUse(state, k)), 'armas desbloqueadas fora da seleção ficam indisponíveis na fase');

const next = Eco.startLevel(p, 1, now + 1, false);
ok(next.ok && JSON.stringify(next.cfg.loadout) === JSON.stringify(selected), 'seleção fica salva e é reaplicada ao carregar a mesma fase');

const seven = Eco.startLevel(p, 1, now + 2, false, available.slice(0, 7));
ok(!!seven.error, 'servidor rejeita sete armas na mesma fase');

const duplicate = Eco.startLevel(p, 1, now + 3, false, [selected[0], selected[0]]);
ok(!!duplicate.error, 'servidor rejeita arma duplicada no loadout');

const unknown = Eco.startLevel(p, 1, now + 4, false, ['arma-que-nao-existe']);
ok(!!unknown.error, 'servidor rejeita armas que não pertencem à conta');

const oldPlayer = { coins: 123, gems: 7, maxLevel: 4, stars: { 1: 3 } };
Eco.migrate(oldPlayer, now);
ok(oldPlayer.coins === 123 && oldPlayer.maxLevel === 4 && oldPlayer.loadouts && typeof oldPlayer.loadouts === 'object',
  'contas antigas recebem o campo loadouts sem perder moedas nem progresso');

const legacyGame = Sim.createGame({ level: 1, unlocked: available });
ok(available.every(k => Sim.canUse(legacyGame, k)), 'partidas antigas sem loadout continuam compatíveis');
