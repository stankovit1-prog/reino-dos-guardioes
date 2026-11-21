// Testa redução de cartas e variedade de recompensas em todos os baús.
const Sim = require('../shared/sim.js'); const Eco = require('../shared/economy.js');
const ok = (condition, message) => { console.log((condition ? '✅ ' : '❌ ') + message); if (!condition) process.exitCode = 1; };
const expected = { madeira: 6, prata: 14, ouro: 30, magico: 55, lendario: 75, divino: 100 };
const p = Eco.newPlayer(Date.now()); p.maxLevel = 200;
for (const [type, count] of Object.entries(expected)) {
  let seed = 1; const roll = Eco.rollChest(p, type, () => ((seed++ * 7919) % 997) / 997);
  ok(roll.stacks.reduce((sum, entry) => sum + entry[1], 0) === count, type + ' entrega ' + count + ' cartas');
  const bonusP = Eco.newPlayer(Date.now()); bonusP.maxLevel = 200;
  const bonus = Eco.giveChest(bonusP, type, () => 0.1);
  ok(bonus.gold > 0 && bonus.gems > 0 && bonus.energy > 0 && bonus.cards.length > 0, type + ' pode combinar ouro, gemas, energia e cartas');
  const plainP = Eco.newPlayer(Date.now()); plainP.maxLevel = 200;
  const plain = Eco.giveChest(plainP, type, () => 0.9999);
  ok(plain.gold > 0 && plain.gems === 0 && plain.energy === 0, type + ' pode sair sem bônus de gemas ou energia');
}
