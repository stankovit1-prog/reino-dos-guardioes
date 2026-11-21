/*
 * Regras de economia do jogador (moedas, gemas, energia, fases, loja).
 * No jogo real quem executa isto é SÓ O SERVIDOR. O app nunca altera saldo.
 * (O modo demonstração usa o mesmo arquivo dentro do navegador.)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.Economy = factory(root.Sim);
})(typeof self !== 'undefined' ? self : this, function (Sim) {
  'use strict';
  const E = Sim.ECON;
  const DAY_MS = 86400000, TZ_OFFSET = -3 * 3600000;   // horário de Brasília
  const dayNum = (now) => Math.floor((now + TZ_OFFSET) / DAY_MS);

  function newPlayer(now) {
    return { coins: 200, gems: 20, energy: E.ENERGY_MAX, energyAt: now, maxLevel: 0, stars: {},
      perm: {}, unlocked: [], daily: { last: -1, streak: 0 }, bought: {}, name: 'Guardião',
      secrets: {}, gemSpots: {}, cards: {}, loadouts: {}, freeChestAt: now };   // loadouts[fase] = até 10 armas escolhidas
  }

  // SAVE À PROVA DE ATUALIZAÇÃO: quando o jogo ganha campos novos (mapas, itens...),
  // contas antigas recebem só o que falta. Nada que o jogador já tem é apagado ou zerado.
  const SAVE_VERSION = 3;
  function migrate(p, now) {
    const base = newPlayer(now || Date.now());
    for (const k in base) if (p[k] === undefined || p[k] === null) p[k] = base[k];
    for (const k of ['stars', 'perm', 'bought', 'secrets', 'gemSpots', 'cards', 'loadouts']) if (typeof p[k] !== 'object') p[k] = {};
    if (!Array.isArray(p.unlocked)) p.unlocked = [];
    if (!p.daily || typeof p.daily !== 'object') p.daily = { last: -1, streak: 0 };
    p.v = SAVE_VERSION;
    return p;
  }

  function refreshEnergy(p, now) {
    if (p.energy >= E.ENERGY_MAX) { p.energyAt = now; return; }
    const per = E.ENERGY_REGEN_MIN * 60000;
    const gained = Math.floor((now - p.energyAt) / per);
    if (gained > 0) {
      p.energy = Math.min(E.ENERGY_MAX, p.energy + gained);
      p.energyAt = p.energy >= E.ENERGY_MAX ? now : p.energyAt + gained * per;
    }
  }

  function publicView(p, now) {
    refreshEnergy(p, now);
    const per = E.ENERGY_REGEN_MIN * 60000;
    return Object.assign({}, p, {
      nextEnergyIn: p.energy >= E.ENERGY_MAX ? 0 : Math.max(0, p.energyAt + per - now),
      dailyAvailable: p.daily.last !== dayNum(now),
      dailyIndex: p.daily.last === dayNum(now) - 1 ? p.daily.streak % E.DAILY.length : 0,
      dailyNext: p.daily.last === dayNum(now) ? p.daily.streak : p.daily.last === dayNum(now) - 1 ? p.daily.streak + 1 : 1,
      freeChestIn: Math.max(0, (p.freeChestAt || 0) - now), owned: unlockedFor(p), cards: p.cards || {},
      offers: cardOffers(p, now), offersBought: p.offers && p.offers.day === dayNum(now) ? p.offers.bought : [],
    });
  }

  // torres liberadas pelo progresso valem em qualquer fase
  function unlockedFor(p) {
    const unlocked = p.unlocked.slice();
    for (const k of Sim.TOWER_IDS) if (Sim.TOWERS[k].unlock && Sim.TOWERS[k].unlock <= p.maxLevel + 1 && unlocked.indexOf(k) < 0) unlocked.push(k);
    return unlocked;
  }

  // Seleção salva por fase: no máximo seis armas desbloqueadas e pertencentes à conta.
  function chooseLoadout(p, level, requested) {
    const available = unlockedFor(p);
    const key = String(level);
    let chosen;
    if (Array.isArray(requested)) chosen = requested;
    else if (Array.isArray(p.loadouts[key]) && p.loadouts[key].length) chosen = p.loadouts[key];
    else chosen = available.slice(0, 10);

    const clean = [...new Set(chosen.map(k => String(k)))];
    if (chosen.length < 1 || chosen.length > 10 || clean.length !== chosen.length || clean.some(k => !available.includes(k))) {
      return { error: 'Escolha de 1 a 10 armas desbloqueadas na sua conta.' };
    }
    p.loadouts[key] = clean;
    return { loadout: clean };
  }

  function startLevel(p, level, now, bonus, requestedLoadout) {
    level = level | 0;
    p.secrets = p.secrets || {}; p.gemSpots = p.gemSpots || {};
    p.loadouts = p.loadouts || {};
    if (bonus) {                                           // FASE SECRETA: grátis, 1 tentativa
      if (p.secrets[level] !== 'found') return { error: 'Fase secreta não encontrada' };
      const choice = chooseLoadout(p, level, requestedLoadout);
      if (choice.error) return choice;
      p.secrets[level] = 'done';
      return { ok: true, cfg: { level, bonus: true, perm: Object.assign({}, p.perm), unlocked: unlockedFor(p), loadout: choice.loadout } };
    }
    if (level < 1 || level > p.maxLevel + 1) return { error: 'Fase bloqueada' };
    const choice = chooseLoadout(p, level, requestedLoadout);
    if (choice.error) return choice;
    refreshEnergy(p, now);
    if (p.energy < 1) return { error: 'Sem energia' };
    if (p.energy >= E.ENERGY_MAX) p.energyAt = now;
    p.energy -= 1;
    return { ok: true, cfg: { level, perm: Object.assign({}, p.perm), unlocked: unlockedFor(p), loadout: choice.loadout } };
  }

  // run = {cfg, startedAt}; actions vindas do app
  function finishLevel(p, run, actions, now, rand) {
    if (!Array.isArray(actions) || actions.length > 5000) return { error: 'Dados inválidos' };
    const clean = [];
    for (const a of actions) {
      if (!a || typeof a !== 'object') return { error: 'Dados inválidos' };
      const t = a.t | 0;
      if (a.a === 'build') clean.push({ t, a: 'build', x: a.x | 0, y: a.y | 0, k: String(a.k) });
      else if (a.a === 'up' || a.a === 'sell' || a.a === 'repair') clean.push({ t, a: a.a, id: a.id | 0 });
      else if (a.a === 'wave') clean.push({ t, a: 'wave' });
      else if (a.a === 'trap') clean.push({ t, a: 'trap', x: a.x | 0, y: a.y | 0, k: String(a.k) });
      else if (a.a === 'open' || a.a === 'secret' || a.a === 'relic') clean.push({ t, a: a.a, x: a.x | 0, y: a.y | 0 });
      else return { error: 'Dados inválidos' };
    }
    const r = Sim.replay(run.cfg, clean);
    if (!r.ok) return { error: 'Partida inválida (' + r.reason + ')', cheat: true };
    // anti speed-hack: no máximo 2x de velocidade (+ folga)
    const minMs = (r.ticks / Sim.TPS) * 1000 / 2.5;
    if (now - run.startedAt < minMs) return { error: 'Partida rápida demais', cheat: true };

    const level = run.cfg.level;
    p.secrets = p.secrets || {}; p.gemSpots = p.gemSpots || {};
    if (run.cfg.bonus) {                                   // recompensa da fase secreta
      const coins = r.kills * (15 + level * 2);
      const gems = r.kills >= r.spawned ? 8 : r.kills * 2 >= r.spawned ? 3 : 1;
      p.coins += coins; p.gems += gems;
      return { ok: true, bonus: true, status: 'won', kills: r.kills, total: r.spawned, coins, gems, stars: 0 };
    }
    const res = { status: r.status, stars: r.stars, coins: 0, gems: 0 };
    if (r.status === 'won') {
      const prev = p.stars[level] | 0;
      const first = level > p.maxLevel;
      const rw = E.reward(level, r.stars, first);
      // repetir fase dá metade das moedas (evita farm infinito)
      res.coins = first || r.stars > prev ? rw.coins : Math.floor(rw.coins / 2);
      res.gems = r.stars > prev && r.stars === 3 ? Math.max(rw.gems, 2) : 0;
      p.coins += res.coins; p.gems += res.gems;
      if (r.stars > prev) p.stars[level] = r.stars;
      const idx = (level - 1) % Sim.LEVELS_PER_WORLD + 1;
      const chest = first ? (idx === Sim.LEVELS_PER_WORLD ? 'ouro' : idx % 10 === 0 ? 'prata' : 'madeira') : (rand && rand() < 0.3 ? 'madeira' : null);
      if (first) p.maxLevel = level;
      res.chests = [];
      if (chest && rand) res.chests.push(giveChest(p, chest, rand));
      const ms = first && E.milestone(level);
      if (ms && rand) { const c = giveChest(p, ms, rand); c.milestone = true; res.chests.push(c); }
      p.energy += 1;                                   // vitória devolve a energia
      if (r.gemRocks && !p.gemSpots[level]) {          // pedra de gemas: só na 1ª vez
        const g = r.gemRocks * Sim.GEMS_PER_ROCK; p.gems += g; res.gems += g; res.gemRock = g; p.gemSpots[level] = 1;
      }
      if (r.secret && !p.secrets[level]) { p.secrets[level] = 'found'; res.secret = true; }
      p.relics = p.relics || {};
      if (r.relic && !p.relics[level]) {                 // RELÍQUIA: libera uma ARMA SECRETA
        p.relics[level] = 1;
        const k = Sim.SECRET_TOWERS[Math.floor((level - 1) / Sim.LEVELS_PER_WORLD) % Sim.SECRET_TOWERS.length];
        p.cards = p.cards || {};
        if (!owns(p, k)) { p.unlocked.push(k); res.relicWeapon = { k, isNew: true }; }
        else { p.cards[k] = (p.cards[k] | 0) + 10; res.relicWeapon = { k, isNew: false, n: 10 }; }
      }
    }
    return Object.assign({ ok: true }, res);
  }

  const owns = (p, k) => unlockedFor(p).indexOf(k) >= 0;

  // Melhorar arma: precisa de CARTAS + moedas
  function upgrade(p, tower) {
    const T = Sim.TOWERS[tower];
    if (!T) return { error: 'Arma inválida' };
    if (!owns(p, tower)) return { error: 'Você ainda não tem esta arma' };
    p.cards = p.cards || {};
    const lvl = p.perm[tower] | 0;
    if (lvl >= Sim.MAX_PERM) return { error: 'Nível máximo' };
    const need = E.cardsNeed(lvl, T.rar), cost = E.upCoins(lvl, T.rar);
    if ((p.cards[tower] | 0) < need) return { error: 'Cartas insuficientes (' + (p.cards[tower] | 0) + '/' + need + ')' };
    if (p.coins < cost) return { error: 'Moedas insuficientes' };
    p.coins -= cost; p.cards[tower] -= need; p.perm[tower] = lvl + 1;
    return { ok: true };
  }

  /* ---------- BAÚS ----------
   * rand() vem do SERVIDOR (sorteio seguro). Só saem raridades já liberadas pela fase do jogador. */
  function availRarities(p) { return Sim.RARITY_IDS.filter(r => Sim.RARITIES[r].arena <= p.maxLevel + 1); }
  function rollChest(p, type, rand) {
    const C = E.CHESTS[type], av = availRarities(p);
    const clamp = (r) => { let i = Sim.RARITY_IDS.indexOf(r); while (i > 0 && av.indexOf(Sim.RARITY_IDS[i]) < 0) i--; return Sim.RARITY_IDS[i]; };
    const pick = (arr) => arr[Math.floor(rand() * arr.length) % arr.length];
    const towersOf = (r) => Sim.TOWER_IDS.filter(k => Sim.TOWERS[k].rar === r);
    const counts = {};
    let left = C.n;
    const guar = Object.assign({}, C.guar);
    if (C.divineChance && av.indexOf('divina') >= 0 && rand() * 100 < C.divineChance) guar.divina = 1;
    for (const r in guar) { const rr = clamp(r); counts[rr] = (counts[rr] || 0) + guar[r]; left -= guar[r]; }
    if (C.secretChance && rand() * 100 < C.secretChance) { counts.secreta = 1; left--; }
    const ws = Object.keys(C.w).map(r => [clamp(r), C.w[r]]), tot = ws.reduce((a, x) => a + x[1], 0);
    for (let i = 0; i < left; i++) { let x = rand() * tot; for (const [r, wgt] of ws) { if ((x -= wgt) < 0) { counts[r] = (counts[r] || 0) + 1; break; } } }
    // agrupa em pilhas (no máx. 2 armas diferentes por raridade)
    const stacks = [];
    for (const r of Sim.RARITY_IDS) {
      if (!counts[r]) continue;
      const list = towersOf(r);
      if (counts[r] >= 6 && list.length > 1) {
        const a = pick(list); let b = pick(list); if (b === a) b = list[(list.indexOf(a) + 1) % list.length];
        const na = Math.ceil(counts[r] * (0.5 + rand() * 0.2));
        stacks.push([a, na], [b, counts[r] - na]);
      } else stacks.push([pick(list), counts[r]]);
    }
    return { stacks, gold: Math.floor(C.gold * (0.8 + rand() * 0.4)) };
  }
  function giveChest(p, type, rand) {
    p.cards = p.cards || {};
    const roll = rollChest(p, type, rand), cards = [];
    for (const [k, n] of roll.stacks) {
      if (n <= 0) continue;
      let left = n, isNew = false;
      if (!owns(p, k)) { p.unlocked.push(k); left--; isNew = true; }     // a 1ª carta libera a arma
      p.cards[k] = (p.cards[k] | 0) + left;
      cards.push({ k, n, isNew, rar: Sim.TOWERS[k].rar });
    }
    // prêmios variados: moedas (às vezes em DOBRO), gemas e energia
    const X = E.CHEST_EXTRA[type] || {};
    let gold = roll.gold, jackpot = false, gems = 0, energy = 0;
    if (X.jackpot && rand() * 100 < X.jackpot) { gold *= 2; jackpot = true; }
    if (X.gems && rand() * 100 < X.gems[0]) gems = X.gems[1] + Math.floor(rand() * (X.gems[2] - X.gems[1] + 1));
    if (X.energy && rand() * 100 < X.energy[0]) energy = X.energy[1];
    p.coins += gold; p.gems += gems;
    if (energy) { p.energy = Math.min(E.ENERGY_MAX * 2, p.energy + energy); }
    return { chest: type, cards, gold, jackpot, gems, energy };
  }
  /* ---------- CARTAS DO DIA (iguais no app e no servidor: dependem só do dia e da fase do jogador) ---------- */
  function dayRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function cardOffers(p, now) {
    const d = dayNum(now), av = availRarities(p), r = dayRng(d * 7919 + Math.min(p.maxLevel, 400));
    const top = av[av.length - 1], second = av[Math.max(0, av.length - 2)];
    const slots = ['comum', av.indexOf('rara') >= 0 ? 'rara' : 'comum', second, top];
    return slots.map((rar, i) => {
      const list = Sim.TOWER_IDS.filter(k => Sim.TOWERS[k].rar === rar);
      const k = list[Math.floor(r() * list.length) % list.length], O = E.OFFER[rar];
      return { i, k, rar, n: O.n, coins: O.coins || 0, gems: O.gems || 0 };
    });
  }
  function buyOffer(p, i, now) {
    const d = dayNum(now);
    if (!p.offers || p.offers.day !== d) p.offers = { day: d, bought: [] };
    const o = cardOffers(p, now)[i | 0];
    if (!o) return { error: 'Oferta inválida' };
    if (p.offers.bought.indexOf(o.i) >= 0) return { error: 'Já comprou esta oferta hoje' };
    if (o.coins && p.coins < o.coins) return { error: 'Moedas insuficientes' };
    if (o.gems && p.gems < o.gems) return { error: 'Gemas insuficientes' };
    p.coins -= o.coins; p.gems -= o.gems;
    p.cards = p.cards || {};
    let isNew = false, n = o.n;
    if (!owns(p, o.k)) { p.unlocked.push(o.k); n--; isNew = true; }
    p.cards[o.k] = (p.cards[o.k] | 0) + n;
    p.offers.bought.push(o.i);
    return { ok: true, chest: 'oferta', cards: [{ k: o.k, n: o.n, isNew, rar: o.rar }], gold: 0, gems: 0, energy: 0 };
  }

  function openChest(p, type, rand, now, pay) {
    const C = E.CHESTS[type];
    if (!C) return { error: 'Baú inválido' };
    if (p.maxLevel + 1 < C.min) return { error: 'Este baú libera na fase ' + C.min };
    if (type === 'madeira') {
      if ((p.freeChestAt || 0) > now) return { error: 'Baú grátis ainda não está pronto' };
      p.freeChestAt = now + E.FREE_CHEST_HOURS * 3600000;
    } else if (pay === 'coins') {
      if (!C.coins) return { error: 'Este baú só sai com gemas' };
      if (p.coins < C.coins) return { error: 'Moedas insuficientes' };
      p.coins -= C.coins;
    } else {
      if (p.gems < C.gems) return { error: 'Gemas insuficientes' };
      p.gems -= C.gems;
    }
    return Object.assign({ ok: true }, giveChest(p, type, rand));
  }

  function buyShop(p, itemId, now) {
    const it = E.SHOP[itemId];
    if (!it) return { error: 'Item inválido' };
    if (it.unlock && p.unlocked.indexOf(it.unlock) >= 0) return { error: 'Você já tem' };
    if (p.gems < it.gems) return { error: 'Gemas insuficientes' };
    p.gems -= it.gems;
    if (it.coins) p.coins += it.coins;
    if (it.energy) { p.energy = Math.max(p.energy, E.ENERGY_MAX); p.energyAt = now; }
    if (it.unlock) p.unlocked.push(it.unlock);
    return { ok: true };
  }

  function dailyReward(streak) {                 // streak = dia da sequência (1, 2, 3...)
    const i = (streak - 1) % E.DAILY.length, week = Math.floor((streak - 1) / E.DAILY.length);
    const rw = Object.assign({}, E.DAILY[i]);
    if (i === E.DAILY.length - 1 && week > 0) rw.chest = E.DAILY_BIG[(week - 1) % E.DAILY_BIG.length];
    return rw;
  }
  function claimDaily(p, now, rand) {
    const d = dayNum(now);
    if (p.daily.last === d) return { error: 'Já resgatado hoje' };
    p.daily.streak = p.daily.last === d - 1 ? p.daily.streak + 1 : 1;
    p.daily.last = d;
    p.daily.best = Math.max(p.daily.best | 0, p.daily.streak);
    const rw = dailyReward(p.daily.streak);
    p.coins += rw.coins || 0; p.gems += rw.gems || 0;
    let chest = null;
    if (rw.chest && rand) chest = giveChest(p, rw.chest, rand);
    return { ok: true, reward: rw, day: p.daily.streak, chest };
  }

  // Chamado SOMENTE depois que o servidor confirmou o pagamento com o Google
  function grantIap(p, productId) {
    const it = E.IAP[productId];
    if (!it) return { error: 'Produto desconhecido' };
    p.gems += it.gems;
    if (it.unlock && p.unlocked.indexOf(it.unlock) < 0) p.unlocked.push(it.unlock);
    if (it.once) p.bought[productId] = 1;
    return { ok: true, gems: it.gems };
  }

  function revokeIap(p, productId) {          // reembolso / estorno
    const it = E.IAP[productId];
    if (!it) return;
    p.gems = Math.max(0, p.gems - it.gems);
  }

  return { giveChest, migrate, SAVE_VERSION, cardOffers, buyOffer, dailyReward, openChest, rollChest, owns, unlockedFor, newPlayer, publicView, startLevel, finishLevel, upgrade, buyShop, claimDaily, grantIap, revokeIap, refreshEnergy };
});
