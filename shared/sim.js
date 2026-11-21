/*
 * Reino dos Guardiões — motor de simulação DETERMINÍSTICO.
 * O MESMO arquivo roda no celular (para jogar) e no servidor (para conferir).
 * Só usa números inteiros e RNG com semente => o servidor refaz a partida
 * inteira a partir das ações do jogador e descobre qualquer trapaça.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = 9, ROWS = 14, CELL = 100;      // 1 célula = 100 unidades
  const TPS = 20;                              // ticks por segundo
  const START_LIVES = 20;
  const BUILD_TICKS = 20 * TPS;                // onda começa sozinha após 20s
  const MAX_TICKS = 60 * 60 * TPS;             // 1h de jogo no máximo

  // ---------- RNG determinístico (mulberry32) ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0);       // inteiro 0..2^32-1
    };
  }
  const rint = (r, n) => r() % n;

  // ---------- Torres ----------
  /* ARMAS (torres). rar = raridade.  unlock = fase em que vem de graça (0 = só em baú/loja)
   * Poderes: splash (área), slow (lentidão), chain (vários alvos), pierce (atravessa), zone (deixa poder no chão),
   *          poison (veneno), knock (empurra pra trás), goldMul (+% ouro), ground (não acerta voadores) */
  const RARITIES = {
    comum:    { name: 'Comum',    color: '#adb5bd', arena: 1,  div: 1,   coinMul: 1 },
    rara:     { name: 'Rara',     color: '#4dabf7', arena: 5,  div: 3,   coinMul: 2 },
    epica:    { name: 'Épica',    color: '#be4bdb', arena: 20, div: 8,   coinMul: 4 },
    lendaria: { name: 'Lendária', color: '#ff922b', arena: 45, div: 25,  coinMul: 8 },
    dourada:  { name: 'Dourada',  color: '#ffd43b', arena: 90, div: 50,  coinMul: 12 },
    divina:   { name: 'Divina',   color: '#fff3bf', arena: 140, div: 120, coinMul: 20 },
    secreta:  { name: 'Secreta',  color: '#e03131', arena: 9999, div: 60, coinMul: 15 },   // só em relíquias escondidas (e raramente no Baú dos Deuses)
  };
  const RARITY_IDS = Object.keys(RARITIES);
  const TOWERS = {
    // ---- Comuns
    arqueiro: { rar: 'comum', name: 'Arqueira', icon: '🏹', color: '#3fb950', cost: 50,  range: 260, dmg: 12, cd: 10, splash: 0,  slow: 0,  chain: 1, unlock: 1, desc: 'Flechas rápidas em 1 alvo.' },
    canhao:   { rar: 'comum', name: 'Canhão',   icon: '💣', color: '#f0883e', cost: 90,  range: 230, dmg: 34, cd: 30, splash: 90, slow: 0,  chain: 1, unlock: 6, ground: true, desc: 'Explode na passarela (área).' },
    lanceiro: { rar: 'comum', name: 'Lanceiro', icon: '🔱', color: '#e9c46a', cost: 85,  range: 280, dmg: 22, cd: 18, splash: 0,  slow: 0,  chain: 1, unlock: 9, pierce: 3, desc: 'Lança atravessa 3 monstros.' },
    // ---- Raras
    gelo:     { rar: 'rara', name: 'Gelo',      icon: '❄️', color: '#58a6ff', cost: 70,  range: 210, dmg: 5,  cd: 16, splash: 70, slow: 40, chain: 1, unlock: 3, ground: true, zone: 'gelo', desc: 'Poça congelada: deixa lento.' },
    besta:    { rar: 'rara', name: 'Besta Dupla', icon: '🎯', color: '#a9e34b', cost: 80,  range: 250, dmg: 7,  cd: 6,  splash: 0,  slow: 0,  chain: 2, unlock: 0, desc: 'Atira em 2 alvos bem rápido.' },
    veneno:   { rar: 'rara', name: 'Veneno',    icon: '☠️', color: '#82c91e', cost: 85,  range: 220, dmg: 6,  cd: 22, splash: 70, slow: 0,  chain: 1, unlock: 0, poison: 60, desc: 'Envenena em área (dano contínuo).' },
    // ---- Épicas
    mago:     { rar: 'epica', name: 'Maga',     icon: '🔮', color: '#bc8cff', cost: 120, range: 300, dmg: 24, cd: 20, splash: 0,  slow: 0,  chain: 3, unlock: 12, desc: 'Raio mágico em 3 monstros.' },
    balista:  { rar: 'epica', name: 'Balista',  icon: '🗡️', color: '#868e96', cost: 140, range: 420, dmg: 75, cd: 48, splash: 0,  slow: 0,  chain: 1, unlock: 0, pierce: 5, desc: 'Lança gigante de longe, atravessa 5.' },
    tesla:    { rar: 'epica', name: 'Tesla',    icon: '⚡', color: '#74c0fc', cost: 130, range: 180, dmg: 10, cd: 9,  splash: 0,  slow: 0,  chain: 5, unlock: 0, desc: 'Choque que pula em 5 monstros.' },
    // ---- Lendárias
    dragao:   { rar: 'lendaria', name: 'Dragão', icon: '🐉', color: '#ff5d8f', cost: 180, range: 290, dmg: 16, cd: 8,  splash: 60, slow: 0,  chain: 1, unlock: 0, premium: true, zone: 'fogo', desc: 'Fogo que queima no chão.' },
    solar:    { rar: 'lendaria', name: 'Raio Solar', icon: '☀️', color: '#ffd43b', cost: 190, range: 270, dmg: 10, cd: 2,  splash: 0,  slow: 0,  chain: 1, unlock: 0, desc: 'Raio de sol contínuo e fortíssimo.' },
    furacao:  { rar: 'lendaria', name: 'Furacão', icon: '🌪️', color: '#99e9f2', cost: 170, range: 230, dmg: 12, cd: 40, splash: 90, slow: 0,  chain: 1, unlock: 0, knock: 130, ground: true, desc: 'EMPURRA os monstros para trás.' },
    // ---- Douradas
    canhaoouro: { rar: 'dourada', name: 'Canhão de Ouro', icon: '🏆', color: '#fab005', cost: 220, range: 250, dmg: 70, cd: 26, splash: 100, slow: 0, chain: 1, unlock: 0, goldMul: 60, ground: true, desc: 'Explosão dourada: +60% de ouro.' },
    arqueiraouro: { rar: 'dourada', name: 'Arqueira de Ouro', icon: '👑', color: '#ffd43b', cost: 210, range: 310, dmg: 28, cd: 8, splash: 0, slow: 0, chain: 3, unlock: 0, goldMul: 30, desc: '3 flechas douradas por vez.' },
    // ---- Divinas (deuses)
    zeus:     { rar: 'divina', name: 'Zeus',     icon: '🌩️', color: '#e7f5ff', cost: 300, range: 9999, dmg: 160, cd: 55, splash: 70, slow: 0, chain: 3, unlock: 0, desc: 'Raios do céu em QUALQUER lugar do mapa.' },
    poseidon: { rar: 'divina', name: 'Poseidon', icon: '🌊', color: '#3bc9db', cost: 280, range: 330, dmg: 45, cd: 32, splash: 130, slow: 50, chain: 1, unlock: 0, knock: 160, zone: 'agua', desc: 'Onda gigante: empurra e alaga a passarela.' },
  };

  /* ===== FAMÍLIAS DE ARMAS: geram mais 84 armas (total 100) =====
   * style = desenho/tiro usado no app.  base = poder da família (escalado pela raridade). */
  const RAR_RANK = { comum: 0, rara: 1, epica: 2, lendaria: 3, dourada: 4, divina: 5, secreta: 5 };
  const RAR_POWER = { comum: 100, rara: 128, epica: 160, lendaria: 200, dourada: 245, divina: 300, secreta: 285 };
  const FAMILIES = {
    arco:    { style: 'arqueiro', base: { range: 270, dmg: 13, cd: 10, cost: 55 }, list: [
      ['Arqueira Élfica', '🧝', 'rara', '#69db7c'], ['Arqueira Sombria', '🏹', 'epica', '#5f3dc4', { pierce: 2 }], ['Caçadora da Lua', '🌙', 'lendaria', '#adb5bd', { chain: 2 }],
      ['Arqueira Celestial', '👼', 'divina', '#fff3bf', { chain: 3 }], ['Arco do Abismo', '🖤', 'secreta', '#212529', { pierce: 4, ignoreShield: true }]] },
    besta:   { style: 'besta', base: { range: 250, dmg: 8, cd: 6, chain: 2, cost: 75 }, list: [
      ['Besta de Ferro', '🎯', 'comum', '#868e96'], ['Besta Tripla', '🎯', 'epica', '#495057', { chain: 3 }], ['Besta Infernal', '🔥', 'lendaria', '#e03131', { zone: 'fogo' }], ['Besta Real', '👑', 'dourada', '#fab005', { chain: 3, goldMul: 30 }]] },
    canhao:  { style: 'canhao', base: { range: 230, dmg: 34, cd: 30, splash: 90, ground: true, cost: 90 }, list: [
      ['Canhãozinho', '💣', 'comum', '#495057'], ['Canhão Duplo', '💣', 'rara', '#343a40', { chain: 2 }], ['Canhão de Ferro', '⚙️', 'epica', '#868e96', { splash: 120 }],
      ['Canhão Infernal', '🔥', 'lendaria', '#c92a2a', { zone: 'fogo' }], ['Canhão Celestial', '✨', 'divina', '#e7f5ff', { splash: 150, ground: false }]] },
    lanca:   { style: 'lanceiro', base: { range: 280, dmg: 22, cd: 18, pierce: 3, cost: 85 }, list: [
      ['Guarda Real', '💂', 'rara', '#1c7ed6'], ['Lanceiro Negro', '🗡️', 'epica', '#343a40', { pierce: 4 }], ['Hoplita', '🛡️', 'lendaria', '#e67700', { pierce: 5, knock: 60 }], ['Valquíria', '🪽', 'divina', '#ffd43b', { pierce: 7 }]] },
    gelo:    { style: 'gelo', base: { range: 210, dmg: 6, cd: 16, splash: 70, slow: 40, zone: 'gelo', ground: true, cost: 70 }, list: [
      ['Floco de Neve', '❄️', 'comum', '#a5d8ff', { slow: 30 }], ['Cristal Polar', '🧊', 'epica', '#74c0fc', { slow: 55 }], ['Coração de Gelo', '💙', 'lendaria', '#1c7ed6', { slow: 60, stunE: 15 }], ['Rainha do Gelo', '👸', 'divina', '#d0ebff', { slow: 70, stunE: 25, splash: 110 }]] },
    veneno:  { style: 'veneno', base: { range: 220, dmg: 6, cd: 22, splash: 70, poison: 60, cost: 85 }, list: [
      ['Pântano Tóxico', '🧪', 'comum', '#94d82d'], ['Peste Negra', '🦠', 'epica', '#2b8a3e', { poison: 90 }], ['Hidra Venenosa', '🐍', 'lendaria', '#5c940d', { chain: 3, poison: 90 }], ['Praga Divina', '☣️', 'divina', '#d8f5a2', { splash: 130, poison: 120 }]] },
    magia:   { style: 'mago', base: { range: 300, dmg: 22, cd: 20, chain: 3, cost: 115 }, list: [
      ['Aprendiz de Mago', '🪄', 'comum', '#9775fa', { chain: 2 }], ['Feiticeira', '🧙‍♀️', 'rara', '#be4bdb'], ['Arquimaga', '🔮', 'lendaria', '#7048e8', { chain: 5 }],
      ['Merlin', '🧙', 'divina', '#4263eb', { chain: 7 }], ['Grimório Proibido', '📕', 'secreta', '#5c0f0f', { chain: 6, poison: 60 }]] },
    balista: { style: 'balista', base: { range: 420, dmg: 70, cd: 48, pierce: 5, cost: 140 }, list: [
      ['Balista Leve', '🗡️', 'rara', '#a07040', { pierce: 3 }], ['Escorpião de Guerra', '🦂', 'lendaria', '#5c3a14', { pierce: 7 }], ['Balista Dourada', '🏹', 'dourada', '#fab005', { pierce: 6, goldMul: 40 }]] },
    tesla:   { style: 'tesla', base: { range: 180, dmg: 10, cd: 9, chain: 5, cost: 130 }, list: [
      ['Faísca', '✴️', 'comum', '#ffe066', { chain: 2 }], ['Bobina', '🌀', 'rara', '#74c0fc', { chain: 3 }], ['Tempestade Elétrica', '⛈️', 'lendaria', '#4dabf7', { chain: 8, stunE: 8 }], ['Tesla de Ouro', '⚡', 'dourada', '#fab005', { chain: 7, goldMul: 40 }]] },
    fogo:    { style: 'dragao', base: { range: 290, dmg: 16, cd: 8, splash: 60, zone: 'fogo', cost: 180 }, list: [
      ['Salamandra Guardiã', '🦎', 'rara', '#ff922b'], ['Dragão Jovem', '🐲', 'epica', '#f76707'], ['Dragão Ancião', '🐉', 'dourada', '#e8590c', { splash: 90 }],
      ['Bahamut', '👑', 'divina', '#ffd43b', { splash: 110 }], ['Dragão das Sombras', '🖤', 'secreta', '#343a40', { splash: 100, ignoreShield: true }]] },
    sol:     { style: 'solar', base: { range: 270, dmg: 10, cd: 2, cost: 190 }, list: [
      ['Vela Sagrada', '🕯️', 'comum', '#ffe066'], ['Lupa Solar', '🔍', 'rara', '#ffd43b'], ['Farol Divino', '🗼', 'epica', '#fab005'], ['Rá', '🌞', 'divina', '#ff922b', { chain: 2 }]] },
    vento:   { style: 'furacao', base: { range: 230, dmg: 12, cd: 40, splash: 90, knock: 130, ground: true, cost: 170 }, list: [
      ['Brisa', '🍃', 'comum', '#c3fae8', { knock: 70 }], ['Ventania', '💨', 'rara', '#99e9f2', { knock: 100 }], ['Ciclone', '🌀', 'epica', '#66d9e8'], ['Éolo', '🌬️', 'dourada', '#e3fafc', { knock: 200, goldMul: 30 }]] },
    ouro:    { style: 'canhaoouro', base: { range: 250, dmg: 55, cd: 26, splash: 100, goldMul: 60, ground: true, cost: 220 }, list: [
      ['Cofre Explosivo', '🪙', 'rara', '#fab005', { goldMul: 40 }], ['Mina de Ouro', '⛏️', 'epica', '#f59f00', { goldMul: 70 }], ['Rei Midas', '💰', 'lendaria', '#ffd43b', { goldMul: 120 }], ['Tesouro Pirata', '🏴‍☠️', 'dourada', '#e67700', { goldMul: 100, chain: 2 }]] },
    raio:    { style: 'zeus', base: { range: 9999, dmg: 120, cd: 55, splash: 70, chain: 2, cost: 300 }, list: [
      ['Nuvem de Chuva', '🌧️', 'epica', '#adb5bd', { chain: 1 }], ['Thor', '🔨', 'lendaria', '#4dabf7'], ['Raiden', '🌩️', 'dourada', '#9775fa', { chain: 3, stunE: 10 }]] },
    agua:    { style: 'poseidon', base: { range: 330, dmg: 40, cd: 32, splash: 120, slow: 45, knock: 120, zone: 'agua', cost: 260 }, list: [
      ['Fonte Encantada', '⛲', 'comum', '#74c0fc', { knock: 60 }], ['Maré Alta', '🌊', 'rara', '#339af0'], ['Tsunami', '🌊', 'lendaria', '#1864ab', { knock: 200 }], ['Leviatã', '🐋', 'secreta', '#0b7285', { knock: 220, splash: 160 }]] },
    foice:   { style: 'foice', base: { range: 170, dmg: 55, cd: 22, chain: 2, execute: 12, cost: 170 }, list: [
      ['Lenhador', '🪓', 'comum', '#a07040', { execute: 0, chain: 1 }], ['Carrasco', '🪓', 'epica', '#495057'], ['Ceifador', '💀', 'lendaria', '#212529', { execute: 18 }], ['A Morte', '☠️', 'secreta', '#000000', { execute: 25, chain: 3 }]] },
    sino:    { style: 'sino', base: { range: 200, dmg: 10, cd: 60, splash: 160, stunE: 25, cost: 150 }, list: [
      ['Sino da Vila', '🔔', 'rara', '#e9c46a', { stunE: 15 }], ['Sino Sagrado', '🔔', 'epica', '#ffd43b'], ['Gongo do Trovão', '🥁', 'lendaria', '#e67700', { stunE: 35, splash: 200 }], ['Sino do Juízo Final', '🛎️', 'divina', '#fff3bf', { stunE: 45, splash: 240 }]] },
    meteoro: { style: 'meteoro', base: { range: 600, dmg: 90, cd: 70, splash: 140, zone: 'fogo', ground: true, cost: 230 }, list: [
      ['Catapulta', '🪨', 'comum', '#868e96', { zone: null, range: 400, cost: 110, dmg: 50 }], ['Trebuchet', '🏗️', 'rara', '#a07040', { zone: null }], ['Chuva de Meteoros', '☄️', 'lendaria', '#ff922b', { chain: 3 }], ['Cometa Divino', '🌠', 'divina', '#fff3bf', { chain: 4, splash: 170 }]] },
    olho:    { style: 'olho', base: { range: 9999, dmg: 14, cd: 25, chain: 6, slow: 30, cost: 200 }, list: [
      ['Olho Vigia', '👁️', 'rara', '#adb5bd', { range: 400, chain: 3 }], ['Olho Maldito', '🧿', 'epica', '#7048e8', { range: 500 }], ['Olho de Hórus', '𓂀', 'dourada', '#fab005', { goldMul: 40, chain: 8 }], ['Olho do Abismo', '👁️', 'secreta', '#c92a2a', { chain: 10, slow: 45, poison: 60 }]] },
    espada:  { style: 'espada', base: { range: 190, dmg: 45, cd: 14, pierce: 3, cost: 120 }, list: [
      ['Espadachim', '🤺', 'comum', '#ced4da'], ['Cavaleiro', '🛡️', 'rara', '#868e96'], ['Paladino', '⚜️', 'epica', '#ffd43b', { pierce: 4 }], ['Samurai', '🥷', 'lendaria', '#c92a2a', { pierce: 5, execute: 8 }],
      ['Excalibur', '⚔️', 'secreta', '#4dabf7', { pierce: 7, ignoreShield: true }], ['Espada do Caos', '🗡️', 'secreta', '#5c0f0f', { pierce: 6, zone: 'fogo', ignoreShield: true }]] },
  };
  (function gerarArmas() {
    for (const fam in FAMILIES) {
      const F = FAMILIES[fam];
      F.list.forEach(([name, icon, rar, color, extra], i) => {
        const P = RAR_POWER[rar], rank = RAR_RANK[rar], b = F.base;
        const t = Object.assign({ rar, name, icon, color, style: F.style, fam, unlock: 0, splash: 0, slow: 0, chain: 1 }, b);
        t.dmg = Math.max(1, Math.floor(b.dmg * P / 100));
        if (b.range < 9999) t.range = Math.floor(b.range * (100 + 5 * rank) / 100);
        t.cost = Math.floor(b.cost * (85 + 12 * rank) / 100);
        Object.assign(t, extra || {});
        if (extra && extra.zone === null) delete t.zone;
        if (rar === 'secreta') t.secret = true;
        const pw = [t.splash && 'área', t.slow && 'lentidão', t.chain > 1 && t.chain + ' alvos', t.pierce && 'atravessa ' + t.pierce, t.zone && 'poder no chão', t.poison && 'veneno', t.knock && 'empurra', t.stunE && 'paralisa monstros', t.execute && 'executa fracos', t.goldMul && '+' + t.goldMul + '% ouro', t.ignoreShield && 'fura escudos', t.range >= 9999 && 'mapa inteiro'].filter(Boolean);
        t.desc = pw.join(', ') + '.';
        TOWERS[fam + '_' + i] = t;
      });
    }
  })();
  // armas originais: estilo = o próprio nome
  for (const k in TOWERS) if (!TOWERS[k].style) TOWERS[k].style = k;
  const SECRET_TOWERS = Object.keys(TOWERS).filter(k => TOWERS[k].rar === 'secreta');
  const TOWER_IDS = Object.keys(TOWERS);
  const MAX_TLVL = 3;          // melhoria dentro da fase
  const RANKS = { comum: 0, rara: 1, epica: 2, lendaria: 3, dourada: 4, divina: 5, secreta: 5 };
  const towerMaxHp = (tw) => 120 + 70 * (tw.lvl - 1) + 10 * (tw.perm | 0) + 45 * (RANKS[(TOWERS[tw.type] || {}).rar] | 0);
  const repairCost = (tw) => Math.ceil((towerMaxHp(tw) - tw.hp) * TOWERS[tw.type].cost * 50 / 100 / towerMaxHp(tw));
  const MAX_PERM = 30;         // melhoria permanente (moedas)

  // ---------- Inimigos ----------
  /* ---------- MUNDOS E MONSTROS ----------
   * Cada mundo tem 10 fases, cenário próprio, 4 monstros exclusivos e 1 chefão.
   * Depois do mundo 5 os mundos se repetem com monstros EVOLUÍDOS (armadura).
   * Poderes: fly (voa), shield (escudo %), heal (cura), split (se divide), summon (invoca),
   *          dash (arrancada), burrow (entra na terra), revive (revive 1x), jump (salta),
   *          noSlow (imune a gelo), resist {torre: % de dano}
   */
  const ENEMIES = {
    // 1 — Floresta Encantada
    slime:    { name: 'Gosminha',        hp: 55,  spd: 6,  gold: 4,  dmg: 1, r: 26, color: '#34d399', desc: 'Pula devagarinho pelo caminho.' },
    goblin:   { name: 'Goblin',          hp: 45,  spd: 9,  gold: 5,  dmg: 1, r: 24, color: '#e63946', desc: 'Pequeno e apressado.' },
    lobo:     { name: 'Lobo',            hp: 42,  spd: 11, gold: 5,  dmg: 1, r: 25, color: '#8d99ae', desc: 'Dá ARRANCADAS de velocidade.', dash: true },
    morcego:  { name: 'Morcego',         hp: 35,  spd: 9,  gold: 6,  dmg: 1, r: 22, color: '#845ec2', desc: 'VOA! Canhão e Gelo não acertam.', fly: true },
    ogro:     { name: 'Rei Ogro',        hp: 1300, spd: 3, gold: 70, dmg: 5, r: 46, color: '#f76707', desc: 'Chefão! INVOCA goblins e ARREMESSA PEDRAS nas torres.', boss: true, summon: { type: 'goblin', n: 2 } },
    // 2 — Deserto Escaldante
    escorpiao:{ name: 'Escorpião',       hp: 80,  spd: 7,  gold: 7,  dmg: 1, r: 26, color: '#f97316', desc: 'Carapaça com ESCUDO. Cospe VENENO nas torres.', shield: 45 },
    mumia:    { name: 'Múmia',           hp: 90,  spd: 5,  gold: 8,  dmg: 1, r: 27, color: '#e9dcc0', desc: 'REVIVE uma vez depois de derrotada!', revive: true },
    besouro:  { name: 'Escaravelho',     hp: 70,  spd: 8,  gold: 7,  dmg: 1, r: 24, color: '#2563eb', desc: 'ENTRA NA AREIA e fica intocável por um tempo.', burrow: true },
    abutre:   { name: 'Abutre',          hp: 60,  spd: 8,  gold: 7,  dmg: 1, r: 26, color: '#9d4edd', desc: 'VOA sobre o deserto.', fly: true },
    farao:    { name: 'Faraó Esfinge',   hp: 1500, spd: 3, gold: 80, dmg: 5, r: 46, color: '#f2c94c', desc: 'Chefão! Acorda múmias e AMALDIÇOA torres (param de atirar).', boss: true, summon: { type: 'mumia', n: 2 } },
    // 3 — Pântano Sombrio
    sapo:     { name: 'Sapo Saltador',   hp: 85,  spd: 5,  gold: 8,  dmg: 1, r: 25, color: '#c77dff', desc: 'SALTA lá na frente e cospe VENENO nas torres.', jump: true },
    mosquito: { name: 'Mosquitão',       hp: 55,  spd: 12, gold: 8,  dmg: 1, r: 20, color: '#264653', desc: 'VOA muito rápido.', fly: true },
    croco:    { name: 'Crocodilo',       hp: 200, spd: 4,  gold: 14, dmg: 2, r: 34, color: '#2a9d8f', desc: 'Couro grosso: ESCUDO enorme.', shield: 60 },
    xama:     { name: 'Xamã do Pântano', hp: 110, spd: 5,  gold: 14, dmg: 1, r: 28, color: '#e76f51', desc: 'CURA os monstros perto dele.', heal: true },
    bruxa:    { name: 'Bruxa do Pântano',hp: 1700, spd: 3, gold: 90, dmg: 5, r: 44, color: '#7048e8', desc: 'Chefona! Cura, invoca sapos e AMALDIÇOA torres.', boss: true, heal: true, summon: { type: 'sapo', n: 2 } },
    // 4 — Montanhas Geladas
    pinguim:  { name: 'Pinguim',         hp: 90,  spd: 10, gold: 8,  dmg: 1, r: 24, color: '#2b2d42', desc: 'Desliza rápido e é IMUNE AO GELO.', noSlow: true },
    yeti:     { name: 'Yeti',            hp: 260, spd: 4,  gold: 16, dmg: 2, r: 36, color: '#e0fbfc', desc: 'Gigante com ESCUDO. Joga BOLAS DE NEVE nas torres.', shield: 40 },
    lobogelo: { name: 'Lobo da Neve',    hp: 100, spd: 11, gold: 10, dmg: 1, r: 26, color: '#90e0ef', desc: 'ARRANCADAS e imune ao gelo.', dash: true, noSlow: true },
    espirito: { name: 'Espírito Gélido', hp: 90,  spd: 8,  gold: 10, dmg: 1, r: 24, color: '#5e60ce', desc: 'Fantasma que VOA e CONGELA torres.', fly: true, noSlow: true },
    golem:    { name: 'Golem de Gelo',   hp: 2000, spd: 2, gold: 100, dmg: 6, r: 48, color: '#4dabf7', desc: 'Chefão! Joga blocos de GELO e se parte em 2 Yetis.', boss: true, shield: 30, split: { type: 'yeti', n: 2, pct: 60 } },
    // 5 — Vulcão Flamejante
    diabrete: { name: 'Diabrete',        hp: 90,  spd: 11, gold: 9,  dmg: 1, r: 22, color: '#d62828', desc: 'Rápido, resiste a fogo e lança BOLAS DE FOGO nas torres.', resist: { dragao: 50, solar: 50 } },
    salamandra:{name: 'Salamandra',      hp: 140, spd: 7,  gold: 12, dmg: 1, r: 26, color: '#f77f00', desc: 'Some na LAVA por um tempo.', burrow: true, resist: { dragao: 50, solar: 50 } },
    magma:    { name: 'Golem de Magma',  hp: 280, spd: 4,  gold: 16, dmg: 2, r: 36, color: '#6a040f', desc: 'Se DIVIDE em 3 diabretes e joga LAVA nas torres.', split: { type: 'diabrete', n: 3, pct: 50 } },
    fenix:    { name: 'Fênix',           hp: 110, spd: 9,  gold: 14, dmg: 1, r: 26, color: '#ffbe0b', desc: 'VOA e RENASCE das cinzas.', fly: true, revive: true },
    // 6 — Ilha dos Piratas
    caranguejo:{ name: 'Caranguejo',     hp: 110, spd: 6,  gold: 9,  dmg: 1, r: 25, color: '#e63946', desc: 'Casco duro: ESCUDO. Belisca as armas.', shield: 40 },
    pirata:   { name: 'Pirata Esqueleto',hp: 100, spd: 7,  gold: 10, dmg: 1, r: 26, color: '#d9ed92', desc: 'Atira BALAS DE CANHÃO nas armas.' },
    gaivota:  { name: 'Gaivota Ladra',   hp: 70,  spd: 11, gold: 9,  dmg: 1, r: 22, color: '#edf6f9', desc: 'VOA rápido sobre o mar.', fly: true },
    polvo:    { name: 'Polvo',           hp: 150, spd: 5,  gold: 14, dmg: 2, r: 30, color: '#9d4edd', desc: 'Joga TINTA e cega as armas (param).' },
    kraken:   { name: 'Kraken',          hp: 2600, spd: 2, gold: 130, dmg: 6, r: 50, color: '#862e9c', desc: 'Chefão do mar! Invoca polvos e esmaga armas.', boss: true, shield: 25, summon: { type: 'polvo', n: 2 } },
    // 7 — Cemitério Assombrado
    zumbi:    { name: 'Zumbi',           hp: 140, spd: 4,  gold: 10, dmg: 1, r: 26, color: '#90be6d', desc: 'Lento, mas REVIVE uma vez.', revive: true },
    esqueleto:{ name: 'Esqueleto',       hp: 100, spd: 9,  gold: 10, dmg: 1, r: 24, color: '#f1f3f5', desc: 'Corre com ARRANCADAS e joga ossos.', dash: true },
    fantasma: { name: 'Fantasma',        hp: 90,  spd: 8,  gold: 12, dmg: 1, r: 24, color: '#caf0f8', desc: 'Voa e fica INVISÍVEL de vez em quando.', fly: true, burrow: true },
    vampiro:  { name: 'Morcego Vampiro', hp: 110, spd: 10, gold: 12, dmg: 1, r: 23, color: '#720026', desc: 'VOA e CURA os amigos.', fly: true, heal: true },
    conde:    { name: 'Conde Vampiro',   hp: 2900, spd: 3, gold: 140, dmg: 6, r: 46, color: '#5f3dc4', desc: 'Chefão! Cura, invoca morcegos e amaldiçoa armas.', boss: true, heal: true, summon: { type: 'vampiro', n: 2 } },
    // 8 — Cavernas de Cristal
    aranha:   { name: 'Aranha de Cristal', hp: 100, spd: 11, gold: 11, dmg: 1, r: 24, color: '#7b2cbf', desc: 'Rápida. Joga TEIA nas armas (param).' },
    toupeira: { name: 'Toupeira',        hp: 150, spd: 6,  gold: 12, dmg: 1, r: 25, color: '#bc6c25', desc: 'CAVA e some debaixo da terra.', burrow: true },
    morcegocristal: { name: 'Morcego de Cristal', hp: 100, spd: 10, gold: 12, dmg: 1, r: 22, color: '#00b4d8', desc: 'VOA e é imune a gelo.', fly: true, noSlow: true },
    golemcristal: { name: 'Golem de Cristal', hp: 320, spd: 3, gold: 20, dmg: 2, r: 36, color: '#ff70a6', desc: 'ESCUDO enorme. Vira 2 aranhas.', shield: 50, split: { type: 'aranha', n: 2, pct: 50 } },
    rainha:   { name: 'Rainha Aranha',   hp: 3200, spd: 3, gold: 150, dmg: 7, r: 48, color: '#7048e8', desc: 'Chefona! Invoca aranhas e prende armas na teia.', boss: true, shield: 30, summon: { type: 'aranha', n: 3 } },
    // 9 — Reino das Nuvens
    harpia:   { name: 'Harpia',          hp: 120, spd: 10, gold: 12, dmg: 1, r: 25, color: '#f4a261', desc: 'VOA e dá rasantes nas armas.', fly: true },
    duende:   { name: 'Duende do Vento', hp: 110, spd: 12, gold: 11, dmg: 1, r: 22, color: '#2a9d8f', desc: 'ARRANCADAS e imune ao gelo.', dash: true, noSlow: true },
    nuvem:    { name: 'Nuvem Brava',     hp: 160, spd: 5,  gold: 14, dmg: 1, r: 30, color: '#adb5bd', desc: 'VOA e solta RAIOS que paralisam armas.', fly: true },
    grifo:    { name: 'Grifo',           hp: 260, spd: 7,  gold: 18, dmg: 2, r: 32, color: '#f6bd60', desc: 'VOA com ESCUDO de penas.', fly: true, shield: 40 },
    tempestade: { name: 'Rei Tempestade', hp: 3500, spd: 3, gold: 160, dmg: 7, r: 48, color: '#1c7ed6', desc: 'Chefão! Voa, invoca nuvens e solta trovões.', boss: true, fly: true, summon: { type: 'nuvem', n: 2 } },
    // 10 — Abismo Sombrio
    cavaleiro:{ name: 'Cavaleiro Negro', hp: 300, spd: 4,  gold: 18, dmg: 2, r: 32, color: '#495057', desc: 'Armadura: ESCUDO gigante.', shield: 70 },
    demonio:  { name: 'Demônio',         hp: 180, spd: 9,  gold: 15, dmg: 1, r: 27, color: '#f72585', desc: 'Resiste a fogo e lança chamas.', resist: { dragao: 50, solar: 50 } },
    sombra:   { name: 'Sombra',          hp: 140, spd: 11, gold: 14, dmg: 1, r: 24, color: '#212529', desc: 'Some nas trevas (INVISÍVEL) e dá arrancadas.', burrow: true, dash: true },
    dragaonegro: { name: 'Dragão Negro', hp: 260, spd: 8,  gold: 20, dmg: 2, r: 32, color: '#6a4c93', desc: 'VOA e cospe fogo negro.', fly: true, revive: true },
    trevas:   { name: 'Senhor do Inferno', hp: 4200, spd: 2, gold: 220, dmg: 8, r: 52, color: '#212529', desc: 'Chefão FINAL! Escudo, cura, invoca sombras e amaldiçoa.', boss: true, shield: 40, heal: true, summon: { type: 'sombra', n: 3 } },
    larva:    { name: 'Larva de Lava',   hp: 220, spd: 5,  gold: 16, dmg: 1, r: 28, color: '#fd7e14', desc: 'Rasteja na lava e se DIVIDE em 3 larvinhas.', split: { type: 'larvinha', n: 3, pct: 40 }, resist: { dragao: 60, solar: 60 } },
    larvinha: { name: 'Larvinha',        hp: 80,  spd: 9,  gold: 4,  dmg: 1, r: 18, color: '#ffa94d', desc: 'Pequena e rápida.', resist: { dragao: 60, solar: 60 } },
    ladrao:   { name: 'Goblin Ladrão',   hp: 60,  spd: 9,  gold: 15, dmg: 0, r: 25, color: '#fcc419', desc: 'Foge com o tesouro! Derrote todos.', bonusOnly: true },
    senhor:   { name: 'Senhor das Chamas', hp: 2300, spd: 3, gold: 120, dmg: 6, r: 48, color: '#e03131', desc: 'Chefão final! Escudo, invoca diabretes e QUEIMA torres.', boss: true, shield: 30, summon: { type: 'diabrete', n: 2 } },
  };
  /* Ataques contra TORRES: kind (visual), dmg (vida da torre), every (ticks), range, stun (ticks parada) */
  const ATK = {
    // ---- todos os monstros atacam as armas que estão perto do caminho
    slime:     { kind: 'gosma',   dmg: 3,  every: 100, range: 190 },
    goblin:    { kind: 'pedra',   dmg: 4,  every: 80,  range: 210 },
    lobo:      { kind: 'mordida', dmg: 6,  every: 80,  range: 130 },
    morcego:   { kind: 'mergulho',dmg: 5,  every: 100, range: 160 },
    mumia:     { kind: 'maldicao',dmg: 5,  every: 130, range: 160, stun: 12 },
    besouro:   { kind: 'mordida', dmg: 5,  every: 90,  range: 130 },
    abutre:    { kind: 'mergulho',dmg: 6,  every: 100, range: 170 },
    mosquito:  { kind: 'veneno',  dmg: 4,  every: 90,  range: 150 },
    croco:     { kind: 'mordida', dmg: 12, every: 100, range: 130 },
    xama:      { kind: 'maldicao',dmg: 5,  every: 120, range: 200, stun: 30 },
    pinguim:   { kind: 'neve',    dmg: 4,  every: 90,  range: 160 },
    lobogelo:  { kind: 'mordida', dmg: 7,  every: 80,  range: 130 },
    salamandra:{ kind: 'fogo',    dmg: 6,  every: 90,  range: 160 },
    fenix:     { kind: 'fogo',    dmg: 9,  every: 100, range: 200 },
    ogro:      { kind: 'pedra',   dmg: 30, every: 70,  range: 260 },
    caranguejo:{ kind: 'mordida', dmg: 7,  every: 80,  range: 140 },
    larva:     { kind: 'lava',    dmg: 12, every: 90,  range: 170 },
    larvinha:  { kind: 'lava',    dmg: 4,  every: 70,  range: 130 },
    pirata:    { kind: 'pedra',   dmg: 9,  every: 90,  range: 230 },
    gaivota:   { kind: 'mergulho',dmg: 6,  every: 90,  range: 170 },
    polvo:     { kind: 'tinta',   dmg: 6,  every: 110, range: 200, stun: 30 },
    kraken:    { kind: 'tinta',   dmg: 45, every: 80,  range: 300, stun: 40 },
    zumbi:     { kind: 'mordida', dmg: 9,  every: 90,  range: 130 },
    esqueleto: { kind: 'pedra',   dmg: 7,  every: 80,  range: 200 },
    fantasma:  { kind: 'congela', dmg: 4,  every: 110, range: 180, stun: 25 },
    vampiro:   { kind: 'mordida', dmg: 8,  every: 90,  range: 150 },
    conde:     { kind: 'maldicao',dmg: 40, every: 80,  range: 300, stun: 50 },
    aranha:    { kind: 'teia',    dmg: 5,  every: 100, range: 180, stun: 30 },
    toupeira:  { kind: 'pedra',   dmg: 9,  every: 90,  range: 150 },
    morcegocristal: { kind: 'gelo', dmg: 7, every: 90, range: 170 },
    golemcristal: { kind: 'pedra', dmg: 16, every: 100, range: 220 },
    rainha:    { kind: 'teia',    dmg: 40, every: 80,  range: 300, stun: 60 },
    harpia:    { kind: 'mergulho',dmg: 9,  every: 80,  range: 190 },
    duende:    { kind: 'neve',    dmg: 6,  every: 80,  range: 170 },
    nuvem:     { kind: 'raio',    dmg: 8,  every: 110, range: 220, stun: 30 },
    grifo:     { kind: 'mergulho',dmg: 14, every: 90,  range: 200 },
    tempestade:{ kind: 'raio',    dmg: 50, every: 70,  range: 330, stun: 40 },
    cavaleiro: { kind: 'pedra',   dmg: 18, every: 100, range: 160 },
    demonio:   { kind: 'fogo',    dmg: 10, every: 80,  range: 210 },
    sombra:    { kind: 'maldicao',dmg: 8,  every: 100, range: 180, stun: 25 },
    dragaonegro:{ kind: 'fogo',   dmg: 16, every: 80,  range: 240 },
    trevas:    { kind: 'maldicao',dmg: 60, every: 70,  range: 340, stun: 60 },
    escorpiao: { kind: 'veneno',  dmg: 5,  every: 85,  range: 190 },
    farao:     { kind: 'maldicao',dmg: 10, every: 110, range: 300, stun: 90 },
    sapo:      { kind: 'veneno',  dmg: 5,  every: 85,  range: 180 },
    bruxa:     { kind: 'maldicao',dmg: 20, every: 100, range: 300, stun: 80 },
    yeti:      { kind: 'neve',    dmg: 10, every: 110,  range: 220 },
    espirito:  { kind: 'congela', dmg: 2,  every: 120, range: 200, stun: 45 },
    golem:     { kind: 'gelo',    dmg: 40, every: 80,  range: 280, stun: 40 },
    diabrete:  { kind: 'fogo',    dmg: 5,  every: 90,  range: 200 },
    magma:     { kind: 'lava',    dmg: 12, every: 110,  range: 220 },
    senhor:    { kind: 'fogo',    dmg: 45, every: 70,  range: 320, stun: 30 },
  };
  const WORLDS = [
    { name: 'Floresta dos Mistérios', icon: '🌲', mobs: ['slime', 'goblin', 'lobo', 'morcego'], boss: 'ogro' },
    { name: 'Deserto dos Faraós', icon: '🏺', mobs: ['escorpiao', 'mumia', 'besouro', 'abutre'], boss: 'farao' },
    { name: 'Pântano dos Mortos', icon: '💀', mobs: ['sapo', 'mosquito', 'croco', 'xama'], boss: 'bruxa' },
    { name: 'Gelo Encantado',     icon: '❄️', mobs: ['pinguim', 'lobogelo', 'yeti', 'espirito'], boss: 'golem' },
    { name: 'Subterrâneo de Fogo', icon: '🔥', mobs: ['diabrete', 'salamandra', 'fenix', 'magma'], boss: 'senhor' },
    { name: 'Ilha Maldita',       icon: '🏴‍☠️', mobs: ['caranguejo', 'pirata', 'gaivota', 'polvo'], boss: 'kraken' },
    { name: 'Cemitério Assombrado', icon: '🪦', mobs: ['zumbi', 'esqueleto', 'fantasma', 'vampiro'], boss: 'conde' },
    { name: 'Cavernas de Cristal', icon: '💎', mobs: ['aranha', 'toupeira', 'morcegocristal', 'golemcristal'], boss: 'rainha' },
    { name: 'Céu da Tempestade',  icon: '⛈️', mobs: ['harpia', 'duende', 'nuvem', 'grifo'], boss: 'tempestade' },
    { name: 'Inferno',            icon: '😈', mobs: ['larva', 'demonio', 'cavaleiro', 'dragaonegro'], boss: 'trevas' },
  ];
  const LEVELS_PER_WORLD = 40;
  const MOB_FROM = [1, 1, 6, 15];     // em qual fase do mundo cada monstro aparece
  const MOB_WAVE = [0, 0, 1, 2];      // a partir de qual onda
  const worldOf = (level) => Math.floor((level - 1) / LEVELS_PER_WORLD);           // 0,1,2,...
  const worldInfo = (level) => { const w = worldOf(level); return Object.assign({ index: w, num: w + 1, theme: w % WORLDS.length, cycle: Math.floor(w / WORLDS.length) }, WORLDS[w % WORLDS.length]); };
  const tierOf = (level) => Math.min(4, worldInfo(level).cycle);        // evolução: bronze, prata, ouro, diamante
  function mobsAt(level) {
    const W = worldInfo(level), idx = (level - 1) % LEVELS_PER_WORLD + 1;
    return W.mobs.filter((m, i) => idx >= MOB_FROM[i] || W.cycle > 0);
  }

  // ---------- Fase (gerada pelo número da fase) ----------
  function levelSeed(level) { return (Math.imul(level, 2654435761) ^ 0x5bd1e995) >>> 0; }

  // 3 estilos de caminho: zigue-zague, serpente (vai de lado a lado) e cascata (descidas longas)
  function genPath(level, bonus, part, startCol) {
    const r = rng(levelSeed(level) ^ (bonus ? 0xb0b0 : 0) ^ Math.imul(part | 0, 0x9e3779b1));
    let style = bonus ? 1 : (level < 3 ? 0 : rint(r, 3));
    if (startCol != null && style === 1) style = 2;          // continuação começa onde a parte anterior terminou
    const cells = [];
    let c, row = 0;
    if (style === 1) {
      c = rint(r, 2) ? 0 : COLS - 1; cells.push([c, 0]);
      let gap = 2 + rint(r, 2);
      while (row < ROWS - 1) {
        for (let i = 0; i < gap && row < ROWS - 1; i++) { row++; cells.push([c, row]); }
        if (row >= ROWS - 2) continue;
        const target = c < COLS / 2 ? COLS - 1 - rint(r, 2) : rint(r, 2);
        while (c !== target) { c += target > c ? 1 : -1; cells.push([c, row]); }
        gap = 2 + rint(r, 2);
      }
      return { cells, style };
    }
    c = startCol != null ? startCol : 1 + rint(r, COLS - 2); cells.push([c, 0]);
    while (row < ROWS - 1) {
      const down = style === 2 ? 2 + rint(r, 3) : 1 + rint(r, 2);
      for (let i = 0; i < down && row < ROWS - 1; i++) { row++; cells.push([c, row]); }
      if (row >= ROWS - 2) continue;
      let target = rint(r, COLS);
      if (Math.abs(target - c) < 2) target = c < COLS / 2 ? Math.min(COLS - 1, c + 3) : Math.max(0, c - 3);
      while (c !== target) { c += target > c ? 1 : -1; cells.push([c, row]); }
    }
    return { cells, style };
  }

  /* Coisas especiais do mapa (sempre iguais para a mesma fase):
   *  obst   = pedras/árvores/lagos (não dá pra construir)
   *  slots  = trechos do caminho onde se coloca ARMADILHA
   *  treas  = baú de ouro (grátis) e pedra com gemas (paga ouro para quebrar)
   *  secret = lugar misterioso -> libera a FASE SECRETA */
  function genFeatures(level, path, bonus, part) {
    const r = rng(levelSeed(level) ^ 0x5eed ^ Math.imul(part | 0, 0x85ebca6b));
    const used = {};
    path.forEach(([c, rr]) => (used[c + ',' + rr] = 1));
    const free = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = 0; x < COLS; x++) if (!used[x + ',' + y]) free.push([x, y]);
    const take = () => { while (free.length) { const i = rint(r, free.length); const p = free.splice(i, 1)[0]; if (!used[p[0] + ',' + p[1]]) { used[p[0] + ',' + p[1]] = 1; return p; } } return null; };
    const f = { obst: [], slots: [], treas: [], secret: null };
    if (bonus) return f;
    const nObst = 4 + rint(r, 5);
    for (let i = 0; i < nObst; i++) { const p = take(); if (p) f.obst.push({ x: p[0], y: p[1], v: rint(r, 3) }); }
    const nSlots = level < 2 ? 1 : level < 8 ? 2 : 3;
    for (let i = 0; i < nSlots; i++) {
      const idx = Math.floor(path.length * (i + 1) / (nSlots + 1)) + rint(r, 3) - 1;
      const p = path[Math.max(2, Math.min(path.length - 3, idx))];
      if (!f.slots.some(q => q.x === p[0] && q.y === p[1])) f.slots.push({ x: p[0], y: p[1] });
    }
    if (level >= 2) { const p = take(); if (p) f.treas.push({ x: p[0], y: p[1], k: 'bau' }); }
    if (level >= 3 && rint(r, 3) === 0) { const p = take(); if (p) f.treas.push({ x: p[0], y: p[1], k: 'gema' }); }
    const idx = (level - 1) % LEVELS_PER_WORLD + 1;
    if (idx % 40 === 25 && !part && !bonus) { const p = take(); if (p) f.relic = { x: p[0], y: p[1] }; }   // RELÍQUIA: arma secreta
    if (idx % 10 === 7 && !part) { const p = take(); if (p) f.secret = { x: p[0], y: p[1] }; }
    return f;
  }
  // Fases em PARTES: o mapa continua (parte 1 -> 2 -> 3)
  const partsOf = (level, bonus) => { if (bonus) return 1; const i = (level - 1) % LEVELS_PER_WORLD + 1; return i === LEVELS_PER_WORLD ? 3 : i % 10 === 0 || i % 10 === 5 ? 2 : 1; };
  const hasSecret = (level) => { const i = (level - 1) % LEVELS_PER_WORLD + 1; return i % 10 === 7; };
  const isBossLevel = (level) => ((level - 1) % LEVELS_PER_WORLD + 1) % 10 === 0;

  // ---------- Armadilhas (vão no caminho) ----------
  const TRAPS = {
    espinhos: { name: 'Espinhos', icon: '🌵', cost: 40, desc: 'Fere quem passa' },
    teia:     { name: 'Teia',     icon: '🕸️', cost: 35, desc: 'Deixa bem lento' },
    bomba:    { name: 'Bomba',    icon: '💥', cost: 60, desc: 'Explode 1 vez' },
  };
  const GEM_ROCK_COST = 80, GEMS_PER_ROCK = 3;

  function genWaves(level, bonus) {
    const r = rng(levelSeed(level) ^ 0xabcdef);
    if (bonus) {
      const hp = Math.floor((100 + 8 * (level - 1)) * 80 / 100);
      return [10, 14, 18].map((c, w) => ({ list: Array(c).fill('ladrao'), gap: 9 - w, hpMul: Math.floor(hp * (100 + 15 * w) / 100) }));
    }
    const n = 6 + Math.min(12, Math.floor(level / 3));
    const W = worldInfo(level), mobs = mobsAt(level);
    const waves = [];
    let raw = 0, cnt = 0;
    for (let w = 0; w < n; w++) {
      const list = [];
      const isBoss = (w === n - 1) && isBossLevel(level);
      const count = 8 + w * 3 + Math.min(20, Math.floor(level / 3));
      const pool = mobs.filter(m => w >= MOB_WAVE[W.mobs.indexOf(m)]);
      for (let i = 0; i < count; i++) { const m = pool[rint(r, 100) % pool.length]; list.push(m); raw += ENEMIES[m].hp * (100 + 12 * w); cnt++; }
      if (isBoss) list.push(W.boss);
      waves.push({ list, gap: Math.max(4, 18 - w - Math.floor(level / 6)), pct: 100 + 12 * w });
    }
    // CADA FASE MAIS DIFÍCIL QUE A ANTERIOR: a vida média dos monstros segue uma curva que só sobe
    // (independente de qual mundo/monstro), e a quantidade de monstros nunca diminui.
    const L = level - 1, target = 95 * (100 + Math.floor(95 * L / 10) + Math.floor(L * L / 220));   // vida média alvo x100
    const factor = target * 100 / (raw / cnt);                                                        // em % sobre a vida base
    for (const wv of waves) { wv.hpMul = Math.max(1, Math.floor(factor * wv.pct / 100)); delete wv.pct; }
    return waves;
  }

  // ---------- Estado ----------
  // monta o mapa de uma parte da fase
  function buildMap(s, part, startCol) {
    const gp = genPath(s.level, s.bonus, part, startCol), path = gp.cells;
    const pts = path.map(([c, r]) => [c * CELL + CELL / 2, r * CELL + CELL / 2]);
    pts.unshift([pts[0][0], -CELL]);                      // entra por cima
    const last = pts[pts.length - 1];
    pts.push([last[0], ROWS * CELL + CELL]);              // sai por baixo
    const segLen = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
      segLen.push(L); total += L;
    }
    const blocked = {};
    path.forEach(([c, r]) => (blocked[c + ',' + r] = 1));
    const feat = genFeatures(s.level, path, s.bonus, part);
    feat.obst.forEach(o => (blocked[o.x + ',' + o.y] = 3));
    feat.treas.forEach(o => (blocked[o.x + ',' + o.y] = 4));
    if (feat.secret) blocked[feat.secret.x + ',' + feat.secret.y] = 5;
    if (feat.relic) blocked[feat.relic.x + ',' + feat.relic.y] = 6;
    Object.assign(s, {
      part, style: gp.style, path, pts, segLen, total, blocked,
      obst: feat.obst, slots: feat.slots, traps: [], zones: [],
      treas: feat.treas.map(t => Object.assign({ open: false }, t)),
      secret: feat.secret ? { x: feat.secret.x, y: feat.secret.y, found: false } : (part ? s.secret : null),
      relic: feat.relic ? { x: feat.relic.x, y: feat.relic.y, found: false } : (part ? s.relic : null),
    });
    if (part) s.secretOld = s.secretOld || (s.secret && s.secret.found);
  }

  function createGame(cfg) {
    const level = cfg.level | 0, bonus = !!cfg.bonus;
    const s = {
      level, bonus, tick: 0, gold: bonus ? 260 + level * 6 : 140 + level * 6, lives: START_LIVES,
      gemRocks: 0, spawned: 0, nextTrapId: 1, nextZoneId: 1,
      perm: Object.assign({}, cfg.perm || {}), unlocked: (cfg.unlocked || []).slice(),
      // Quando houver loadout, só as armas escolhidas antes da fase podem ser construídas.
      loadout: Array.isArray(cfg.loadout) ? cfg.loadout.slice(0, 6) : null,
      waves: genWaves(level, bonus), wave: -1, phase: 'build', buildTimer: BUILD_TICKS,
      spawnQ: [], spawnTimer: 0,
      towers: [], nextTowerId: 1, enemies: [], nextEnemyId: 1,
      fx: [], ev: [], tier: tierOf(level), hpMul: 100, status: 'playing', kills: 0, leaked: 0,
      parts: partsOf(level, bonus), secretFound: false,
    };
    // divide as ondas entre as partes
    s.partEnd = [];
    for (let p = 0; p < s.parts; p++) s.partEnd.push(Math.floor(s.waves.length * (p + 1) / s.parts) - 1);
    buildMap(s, 0, null);
    return s;
  }

  // terminou a última onda da parte: avança o mapa
  function nextPart(s) {
    let refund = 0;
    for (const tw of s.towers) refund += Math.floor(tw.spent * 75 / 100);   // torres viram ouro (75%)
    for (const tr of s.traps) if (!tr.used) refund += Math.floor(TRAPS[tr.k].cost * 50 / 100);
    if (s.secret && s.secret.found) s.secretFound = true;
    if (s.relic && s.relic.found) s.relicFound = true;
    s.gold += refund;
    s.towers = [];
    const exitCol = s.path[s.path.length - 1][0];
    buildMap(s, s.part + 1, exitCol);
    if (!s.secret || !s.secret.found) s.secret = null;
    if (!s.relic || !s.relic.found) s.relic = null;
    s.ev.push({ k: 'part', part: s.part, refund });
  }

  function canUse(s, type) {
    const t = TOWERS[type];
    if (!t) return false;
    if (Array.isArray(s.loadout)) return s.loadout.includes(type);
    if (!t.unlock) return s.unlocked.indexOf(type) >= 0;          // compatibilidade com partidas antigas
    return s.level >= t.unlock || s.unlocked.indexOf(type) >= 0;
  }

  function towerStats(s, tw) {
    const b = TOWERS[tw.type];
    const perm = Math.min(MAX_PERM, s.perm[tw.type] | 0);
    const dmg = Math.floor(b.dmg * (100 + 60 * (tw.lvl - 1)) * (100 + 5 * perm) / 10000);   // +5% por nível da carta
    const range0 = Math.floor(b.range * (100 + 10 * (tw.lvl - 1)) / 100);
    const range = b.range >= 9999 ? b.range : range0;
    return { dmg, range, cd: b.cd, splash: b.splash, slow: b.slow, chain: b.chain };
  }
  const upgradeCost = (tw) => Math.floor(TOWERS[tw.type].cost * 70 * tw.lvl / 100);

  // Ações: {t, a:'build', x, y, k} | {t, a:'up', id} | {t, a:'sell', id} | {t, a:'wave'}
  function applyAction(s, act) {
    if (s.status !== 'playing') return false;
    if (act.a === 'build') {
      const x = act.x | 0, y = act.y | 0, k = act.k;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
      if (s.blocked[x + ',' + y]) return false;
      if (!canUse(s, k)) return false;
      if (s.gold < TOWERS[k].cost) return false;
      s.gold -= TOWERS[k].cost;
      s.blocked[x + ',' + y] = 2;
      s.towers.push({ id: s.nextTowerId++, type: k, x, y, lvl: 1, cdLeft: 0, spent: TOWERS[k].cost, lastTarget: 0, hp: 0, perm: Math.min(MAX_PERM, s.perm[k] | 0), stun: 0 });
      s.towers[s.towers.length - 1].hp = towerMaxHp(s.towers[s.towers.length - 1]);
      return true;
    }
    if (act.a === 'up') {
      const tw = s.towers.find(t => t.id === act.id);
      if (!tw || tw.lvl >= MAX_TLVL) return false;
      const c = upgradeCost(tw);
      if (s.gold < c) return false;
      s.gold -= c; tw.lvl++; tw.spent += c; tw.hp += 70;
      return true;
    }
    if (act.a === 'sell') {
      const i = s.towers.findIndex(t => t.id === act.id);
      if (i < 0) return false;
      const tw = s.towers[i];
      s.gold += Math.floor(tw.spent * 60 / 100);
      delete s.blocked[tw.x + ',' + tw.y];
      s.towers.splice(i, 1);
      return true;
    }
    if (act.a === 'repair') {                                // consertar torre danificada
      const tw = s.towers.find(t => t.id === act.id);
      if (!tw || tw.hp >= towerMaxHp(tw)) return false;
      const c = repairCost(tw);
      if (s.gold < c) return false;
      s.gold -= c; tw.hp = towerMaxHp(tw); tw.stun = 0;
      return true;
    }
    if (act.a === 'trap') {                                  // armadilha num trecho do caminho
      const x = act.x | 0, y = act.y | 0, T = TRAPS[act.k];
      if (!T || !s.slots.some(q => q.x === x && q.y === y)) return false;
      if (s.traps.some(t => t.x === x && t.y === y && !t.used)) return false;
      if (s.gold < T.cost) return false;
      s.gold -= T.cost;
      s.traps = s.traps.filter(t => !(t.x === x && t.y === y));
      s.traps.push({ id: s.nextTrapId++, x, y, k: act.k, used: false, cd: 0 });
      return true;
    }
    if (act.a === 'open') {                                  // baú / pedra de gemas
      const x = act.x | 0, y = act.y | 0;
      const t = s.treas.find(q => q.x === x && q.y === y && !q.open);
      if (!t) return false;
      if (t.k === 'gema') { if (s.gold < GEM_ROCK_COST) return false; s.gold -= GEM_ROCK_COST; s.gemRocks++; }
      else s.gold += 40 + s.level * 4;
      t.open = true;
      return true;
    }
    if (act.a === 'relic') {                                 // achou a relíquia da arma secreta
      if (!s.relic || s.relic.found || s.part || (act.x | 0) !== s.relic.x || (act.y | 0) !== s.relic.y) return false;
      s.relic.found = true;
      return true;
    }
    if (act.a === 'secret') {                                // achou o lugar misterioso
      if (!s.secret || s.secret.found || (act.x | 0) !== s.secret.x || (act.y | 0) !== s.secret.y) return false;
      s.secret.found = true;
      return true;
    }
    if (act.a === 'wave') {
      if (s.phase !== 'build') return false;
      s.gold += Math.floor(s.buildTimer / TPS);           // bônus por chamar antes
      startWave(s);
      return true;
    }
    return false;
  }

  function startWave(s) {
    s.wave++;
    const w = s.waves[s.wave];
    s.spawnQ = w.list.slice();
    s.spawnGap = w.gap; s.spawnTimer = 0; s.hpMul = w.hpMul;
    s.phase = 'wave';
  }

  function posAt(s, d) {
    let i = 0;
    while (i < s.segLen.length - 1 && d > s.segLen[i]) { d -= s.segLen[i]; i++; }
    const a = s.pts[i], b = s.pts[i + 1];
    const L = s.segLen[i] || 1;
    return [a[0] + Math.trunc((b[0] - a[0]) * d / L), a[1] + Math.trunc((b[1] - a[1]) * d / L)];
  }

  function step(s) {
    if (s.status !== 'playing') return;
    s.tick++;
    s.fx.length = 0;
    if (s.tick > MAX_TICKS) { s.status = 'lost'; return; }

    if (s.phase === 'build') {
      if (--s.buildTimer <= 0) startWave(s);
    }
    if (s.phase === 'wave' && s.spawnQ.length) {
      if (--s.spawnTimer <= 0) {
        spawnEnemy(s, s.spawnQ.shift(), 0, 100); s.spawned++;
        s.spawnTimer = s.spawnGap;
      }
    }
    s.ev.length = 0;
    // ----- poderes -----
    const born = [];
    for (const en of s.enemies) {
      const E = ENEMIES[en.type];
      en.pt++;
      if (en.d <= 0) continue;
      if (E.heal && en.pt % 50 === 0) {                          // cura em área
        for (const o of s.enemies) {
          if (o.hp <= 0 || o.hp >= o.maxHp) continue;
          const dx = o.x - en.x, dy = o.y - en.y;
          if (dx * dx + dy * dy <= 220 * 220) o.hp = Math.min(o.maxHp, o.hp + Math.floor(o.maxHp * 7 / 100));
        }
        s.ev.push({ k: 'heal', id: en.id, x: en.x, y: en.y });
      }
      if (E.summon && en.pt % 90 === 0) {                         // invoca ajudantes
        for (let j = 0; j < E.summon.n; j++) born.push([E.summon.type, Math.max(1, en.d - 30 - j * 30), 60]);
        s.ev.push({ k: 'summon', id: en.id, x: en.x, y: en.y });
      }
      if (E.burrow) {                                             // entra na terra/lava
        const was = en.under;
        en.under = en.pt % 80 >= 58;
        if (en.under !== was) s.ev.push({ k: en.under ? 'dig' : 'rise', id: en.id, x: en.x, y: en.y });
      }
      const A = ATK[en.type];
      if (A && (en.pt + en.id * 13) % A.every === A.every - 1 && !en.under && s.towers.length) {   // ataques desencontrados   // ataca a torre mais perto
        let best = null, bd = A.range * A.range + 1;
        for (const tw of s.towers) {
          const dx = tw.x * CELL + CELL / 2 - en.x, dy = tw.y * CELL + CELL / 2 - en.y, d2 = dx * dx + dy * dy;
          if (d2 < bd || (d2 === bd && best && tw.id < best.id)) { bd = d2; best = tw; }
        }
        if (best) {
          const dmg = Math.floor(A.dmg * (100 + Math.min(150, Math.floor((s.level - 1) / 2))) / 100);
          best.hp -= dmg;
          if (A.stun) best.stun = Math.max(best.stun, A.stun);
          s.ev.push({ k: 'matk', id: en.id, kind: A.kind, dmg, tw: best.id, x: en.x, y: en.y, x2: best.x * CELL + CELL / 2, y2: best.y * CELL + CELL / 2 });
        }
      }
      if (E.jump && en.pt % 64 === 0 && en.d + 130 < s.total) {  // salto
        s.ev.push({ k: 'jump', id: en.id, x: en.x, y: en.y });
        en.d += 130; en.d10 = en.d * 10; en.jumped = 1;
      }
    }
    for (const b of born) spawnEnemy(s, b[0], b[1], b[2]);
    // ----- mover inimigos -----
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const en = s.enemies[i], E = ENEMIES[en.type];
      if (en.poisonT > 0) { en.poisonT--; if (en.poisonT % 10 === 0) hit(s, en, en.poisonD, 0, 'veneno'); }
      let spd = E.spd * 10;                                       // décimos
      if (en.stunT > 0) { en.stunT--; spd = 0; }                  // paralisado
      if (E.dash && en.pt % 70 < 14) spd *= 2;                    // arrancada
      if (en.slowT > 0) { spd = Math.floor(spd * (100 - en.slowP) / 100); en.slowT--; }
      en.d10 = (en.d10 || 0) + spd;
      en.d = Math.floor(en.d10 / 10);
      if (en.d >= s.total) {
        s.lives -= E.dmg; s.leaked++;
        s.enemies.splice(i, 1);
        continue;
      }
      const p = posAt(s, en.d); en.x = p[0]; en.y = p[1];
    }
    if (s.lives <= 0) { s.lives = 0; s.status = 'lost'; return; }

    // ----- armadilhas -----
    for (const tr of s.traps) {
      if (tr.used) continue;
      const on = s.enemies.filter(en => en.d > 0 && !en.under && !ENEMIES[en.type].fly && Math.floor(en.x / CELL) === tr.x && Math.floor(en.y / CELL) === tr.y);
      if (!on.length) continue;
      const boss = (en) => ENEMIES[en.type].boss;
      if (tr.k === 'espinhos' && s.tick % 4 === 0) {
        for (const en of on) hit(s, en, Math.max(2, Math.floor(en.maxHp * (boss(en) ? 1 : 4) / 100)), 0, 'trap');
        s.ev.push({ k: 'spike', x: tr.x, y: tr.y });
      } else if (tr.k === 'teia') {
        for (const en of on) if (!ENEMIES[en.type].noSlow) { en.slowT = Math.max(en.slowT, 12); en.slowP = Math.max(en.slowP, 65); }
      } else if (tr.k === 'bomba') {
        const bx = tr.x * CELL + CELL / 2, by = tr.y * CELL + CELL / 2;
        for (const en of s.enemies) {
          if (en.d <= 0 || en.under || ENEMIES[en.type].fly) continue;
          const dx = en.x - bx, dy = en.y - by;
          if (dx * dx + dy * dy <= 140 * 140) hit(s, en, Math.floor(en.maxHp * (boss(en) ? 12 : 45) / 100), 0, 'trap');
        }
        tr.used = true;
        s.ev.push({ k: 'boom', x: bx, y: by });
      }
    }

    // ----- torres destruídas -----
    for (let i = s.towers.length - 1; i >= 0; i--) {
      const tw = s.towers[i];
      if (tw.hp > 0) continue;
      delete s.blocked[tw.x + ',' + tw.y];
      s.towers.splice(i, 1);
      s.ev.push({ k: 'tdie', id: tw.id, type: tw.type, x: tw.x, y: tw.y });
    }
    // ----- poderes no chão (gelo / fogo) -----
    for (let i = s.zones.length - 1; i >= 0; i--) {
      const z = s.zones[i];
      if (--z.t <= 0) { s.zones.splice(i, 1); continue; }
      for (const en of s.enemies) {
        if (en.d <= 0 || en.under || ENEMIES[en.type].fly) continue;
        const dx = en.x - z.x, dy = en.y - z.y;
        if (dx * dx + dy * dy > z.r * z.r) continue;
        if (z.k === 'gelo' || z.k === 'agua') { if (!ENEMIES[en.type].noSlow) { en.slowT = Math.max(en.slowT, 6); en.slowP = Math.max(en.slowP, 50); } }
        else if (s.tick % 5 === 0) hit(s, en, z.dmg, 0, 'dragao');
      }
    }

    // ----- torres atiram -----
    for (const tw of s.towers) {
      if (tw.stun > 0) { tw.stun--; continue; }               // congelada / amaldiçoada
      if (tw.cdLeft > 0) { tw.cdLeft--; continue; }
      const st = towerStats(s, tw);
      const cx = tw.x * CELL + CELL / 2, cy = tw.y * CELL + CELL / 2, r2 = st.range * st.range;
      const inRange = [];
      const ground = TOWERS[tw.type].ground;
      for (const en of s.enemies) {
        if (!targetable(en, ground)) continue;
        const dx = en.x - cx, dy = en.y - cy;
        if (dx * dx + dy * dy <= r2) inRange.push(en);
      }
      if (!inRange.length) continue;
      inRange.sort((a, b) => (b.d - a.d) || (a.id - b.id));     // o mais adiantado
      const targets = inRange.slice(0, st.chain);
      const B = TOWERS[tw.type];
      if (B.pierce) {                                          // lança atravessa quem estiver na linha
        const tg = targets[0], lx = tg.x - cx, ly = tg.y - cy, L2 = lx * lx + ly * ly || 1;
        const line = inRange.filter(en => {
          const t = (en.x - cx) * lx + (en.y - cy) * ly; if (t < 0) return false;
          const cr = (en.x - cx) * ly - (en.y - cy) * lx;           // distância à linha (ao quadrado * L2)
          return cr * cr <= 45 * 45 * L2;
        }).sort((a, b) => ((a.x - cx) * lx + (a.y - cy) * ly) - ((b.x - cx) * lx + (b.y - cy) * ly) || a.id - b.id).slice(0, B.pierce);
        if (line.indexOf(tg) < 0) line[0] = tg;
        for (const en of line) { hit(s, en, st.dmg, 0, tw.type); en.lastBy = tw.type; }
        const far = line[line.length - 1];
        s.fx.push({ k: tw.type, tw: tw.id, e: far.id, x1: cx, y1: cy, x2: far.x, y2: far.y, splash: 0 });
        tw.cdLeft = st.cd;
        continue;
      }
      if (B.zone && targets.length) {                          // poder que fica no chão
        const tg = targets[0];
        s.zones.push({ id: s.nextZoneId++, k: B.zone, x: tg.x, y: tg.y, r: 75, t: B.zone === 'fogo' ? 40 : 50, dmg: Math.max(1, Math.floor(st.dmg / 3)) });
        if (s.zones.length > 24) s.zones.shift();
      }
      for (const tg of targets) {
        hit(s, tg, st.dmg, st.slow, tw.type);
        power(s, tg, B, st.dmg, tw.type);
        s.fx.push({ k: tw.type, tw: tw.id, e: tg.id, x1: cx, y1: cy, x2: tg.x, y2: tg.y, splash: st.splash });
        if (st.splash) {
          const s2 = st.splash * st.splash;
          for (const o of s.enemies) {
            if (o === tg || !targetable(o, ground)) continue;
            const dx = o.x - tg.x, dy = o.y - tg.y;
            if (dx * dx + dy * dy <= s2) { hit(s, o, Math.floor(st.dmg / 2), st.slow, tw.type); power(s, o, B, st.dmg, tw.type); }
          }
        }
      }
      tw.cdLeft = st.cd;
    }
    // ----- mortos (revive / se divide) -----
    const splits = [];
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const en = s.enemies[i];
      if (en.hp > 0) continue;
      const E = ENEMIES[en.type];
      if (E.revive && !en.revived) {
        en.revived = 1; en.hp = Math.floor(en.maxHp / 2); en.slowT = 0;
        s.ev.push({ k: 'revive', id: en.id, x: en.x, y: en.y });
        continue;
      }
      s.gold += E.gold; s.kills++; s.enemies.splice(i, 1);
      if (en.lastBy && TOWERS[en.lastBy] && TOWERS[en.lastBy].goldMul) s.gold += Math.floor(E.gold * TOWERS[en.lastBy].goldMul / 100);
      s.ev.push({ k: 'die', id: en.id, type: en.type, x: en.x, y: en.y });
      if (E.split) for (let j = 0; j < E.split.n; j++) splits.push([E.split.type, Math.max(1, en.d - j * 25), E.split.pct]);
    }
    for (let i = splits.length - 1; i >= 0; i--) spawnEnemy(s, splits[i][0], splits[i][1], splits[i][2]);
    // fim de onda
    if (s.phase === 'wave' && !s.spawnQ.length && !s.enemies.length) {
      if (s.wave >= s.waves.length - 1) { s.status = 'won'; return; }
      s.phase = 'build'; s.buildTimer = BUILD_TICKS;
      s.gold += 20 + s.wave * 5;
      if (s.part < s.parts - 1 && s.wave >= s.partEnd[s.part]) nextPart(s);
    }
  }

  function spawnEnemy(s, type, d, pct) {
    const e = ENEMIES[type];
    const hp = Math.max(1, Math.floor(e.hp * s.hpMul / 100 * pct / 100));
    const en = { id: s.nextEnemyId++, type, hp, maxHp: hp, shield: 0, maxShield: 0, d, d10: d * 10, pt: 0, slowT: 0, slowP: 0, x: 0, y: 0, under: false, revived: 0 };
    if (e.shield) en.shield = en.maxShield = Math.floor(hp * e.shield / 100);
    if (d > 0) { const p = posAt(s, d); en.x = p[0]; en.y = p[1]; }
    s.enemies.push(en);
  }

  function targetable(en, ground) {
    if (en.hp <= 0 || en.d <= 0 || en.under) return false;
    if (ground && ENEMIES[en.type].fly) return false;            // canhão/gelo não acertam voadores
    return true;
  }

  // poderes especiais da arma: veneno, empurrão, ouro extra
  function power(s, en, B, dmg, type) {
    en.lastBy = type;
    const boss = ENEMIES[en.type].boss;
    if (B.stunE) en.stunT = Math.max(en.stunT | 0, boss ? Math.floor(B.stunE / 3) : B.stunE);         // paralisa
    if (B.execute && !boss && en.hp > 0 && en.hp * 100 <= en.maxHp * B.execute) { en.hp = 0; s.ev.push({ k: 'exec', id: en.id }); }   // executa
    if (B.poison) { en.poisonT = B.poison; en.poisonD = Math.max(1, Math.floor(dmg * 2 / 3)); }
    if (B.knock && !ENEMIES[en.type].boss && en.d > 0) {
      en.d = Math.max(1, en.d - B.knock); en.d10 = en.d * 10;
      const p = posAt(s, en.d); en.x = p[0]; en.y = p[1];
      s.ev.push({ k: 'knock', id: en.id });
    }
  }

  function hit(s, en, dmg, slow, tower) {
    const E = ENEMIES[en.type];
    const st = TOWERS[tower] ? TOWERS[tower].style : tower;
    if (E.resist && E.resist[st]) dmg = Math.floor(dmg * (100 - E.resist[st]) / 100);
    if (en.shield > 0 && !(TOWERS[tower] && TOWERS[tower].ignoreShield)) { const a = Math.min(en.shield, dmg); en.shield -= a; dmg -= a; }
    en.hp -= dmg;
    if (slow && !E.noSlow) { en.slowT = 30; en.slowP = Math.max(en.slowP, slow); }
  }

  function stars(s) {
    if (s.status !== 'won') return 0;
    if (s.lives >= START_LIVES) return 3;
    if (s.lives >= START_LIVES / 2) return 2;
    return 1;
  }

  /* Refaz uma partida inteira a partir das ações. Usado pelo servidor. */
  function replay(cfg, actions) {
    const s = createGame(cfg);
    let ai = 0, lastT = -1;
    while (s.status === 'playing') {
      while (ai < actions.length && actions[ai].t === s.tick) {
        const a = actions[ai];
        if (a.t < lastT) return { ok: false, reason: 'ordem' };
        lastT = a.t;
        if (!applyAction(s, a)) return { ok: false, reason: 'acao_invalida', at: ai };
        ai++;
      }
      if (ai < actions.length && actions[ai].t < s.tick) return { ok: false, reason: 'tempo' };
      step(s);
    }
    if (ai < actions.length) return { ok: false, reason: 'acoes_depois_do_fim' };
    return { ok: true, status: s.status, stars: stars(s), ticks: s.tick, lives: s.lives, kills: s.kills, wave: s.wave, bonus: s.bonus, spawned: s.spawned, gemRocks: s.gemRocks, secret: !!(s.secretFound || (s.secret && s.secret.found)), relic: !!(s.relicFound || (s.relic && s.relic.found)) };
  }

  // ---------- Economia (mesmos números no app e no servidor) ----------
  const ECON = {
    ENERGY_MAX: 10,
    ENERGY_REGEN_MIN: 15,
    permCost: (lvl) => 120 * (lvl + 1) * (lvl + 1),            // moedas
    reward: (level, st, first) => ({ coins: 25 + level * 6 + st * 10 + (first ? 40 : 0), gems: first && st === 3 && level % 10 === 0 ? 10 : 0 }),
    // Itens comprados com GEMAS (dentro do jogo)
    SHOP: {
      moedas_p:   { name: '600 moedas',    gems: 15,  coins: 600 },
      moedas_m:   { name: '2.000 moedas',  gems: 45,  coins: 2000 },
      moedas_g:   { name: '6.000 moedas',  gems: 120, coins: 6000 },
      energia:    { name: 'Energia cheia', gems: 12,  energy: 'full' },
      dragao:     { name: 'Torre Dragão',  gems: 250, unlock: 'dragao' },
    },
    // Produtos de DINHEIRO REAL (Google Play) -> gemas
    IAP: {
      gemas_mini:     { gems: 40,   price: 'R$ 0,99', brl: 0.99 },
      gemas_p:        { gems: 130,  price: 'R$ 2,99', brl: 2.99, tag: 'Popular' },
      gemas_m:        { gems: 300,  price: 'R$ 5,99', brl: 5.99, tag: '+15%' },
      gemas_g:        { gems: 700,  price: 'R$ 12,99', brl: 12.99, tag: '+30%' },
      gemas_xg:       { gems: 1800, price: 'R$ 29,99', brl: 29.99, tag: 'Melhor valor' },
      pacote_inicial: { gems: 60,   price: 'R$ 1,99', brl: 1.99, unlock: 'dragao', once: true, tag: 'Oferta única' },
    },
    // ---- CARTAS: quantas cartas precisa para subir do nível perm -> perm+1 (dividido pela raridade)
    cardsNeed: (perm, rar) => Math.max(1, Math.ceil((2 * Math.pow(1.7, Math.min(perm, 12)) + 700 * Math.max(0, perm - 12)) / RARITIES[rar].div)),
    upCoins: (perm, rar) => 120 * (perm + 1) * (perm + 1) * RARITIES[rar].coinMul,
    FREE_CHEST_HOURS: 3,
    // ---- CARTAS DO DIA: 4 ofertas que mudam todo dia (cartas avulsas baratas)
    OFFER: { comum: { n: 20, coins: 150 }, rara: { n: 10, coins: 300 }, epica: { n: 4, coins: 600 }, lendaria: { n: 2, gems: 15 }, dourada: { n: 1, gems: 30 }, divina: { n: 1, gems: 60 } },
    /* ---- PRÊMIOS EXTRAS dos baús (sorteados): gemas [chance %, mín, máx], energia [chance %, qtd], moedas em dobro [chance %] */
    CHEST_EXTRA: {
      madeira:  { gems: [25, 1, 3],   energy: [20, 2], jackpot: 5 },
      prata:    { gems: [45, 2, 6],   energy: [30, 3], jackpot: 8 },
      ouro:     { gems: [80, 5, 12],  energy: [40, 5], jackpot: 10 },
      magico:   { gems: [100, 10, 25], energy: [50, 10], jackpot: 12 },
      lendario: { gems: [100, 20, 40], energy: [60, 10], jackpot: 15 },
      divino:   { gems: [100, 40, 80], energy: [100, 10], jackpot: 20 },
    },
    // ---- BAÚS: n = cartas no total, guar = garantidas {raridade: qtd}, w = chance de cada raridade
    CHESTS: {
      madeira:  { name: 'Baú de Madeira',  icon: '📦', min: 1, gems: 0,    n: 15, gold: 80,   guar: {},                         w: { comum: 80, rara: 18, epica: 2 } },
      prata:    { name: 'Baú de Prata',    icon: '🥈', min: 1, gems: 12,   coins: 500,   n: 35, gold: 200,  guar: { rara: 2 },                w: { comum: 70, rara: 25, epica: 5 } },
      ouro:     { name: 'Baú de Ouro',     icon: '🥇', min: 5, gems: 30,   coins: 1200,  n: 90, gold: 450,  guar: { rara: 6, epica: 1 },      w: { comum: 60, rara: 30, epica: 9, lendaria: 1 } },
      magico:   { name: 'Baú Mágico',      icon: '🔮', min: 20, gems: 70,   coins: 3000,  n: 200, gold: 900,  guar: { rara: 15, epica: 4 },     w: { comum: 50, rara: 32, epica: 14, lendaria: 4 } },
      lendario: { name: 'Baú Lendário',    icon: '🔥', min: 45, gems: 150,  coins: 8000, n: 150, gold: 1500, guar: { lendaria: 3, epica: 10 },  w: { comum: 40, rara: 35, epica: 20, lendaria: 4, dourada: 1 } },
      divino:   { name: 'Baú dos Deuses',  icon: '⚡', min: 90, gems: 300,  n: 250, gold: 3000, guar: { dourada: 3, lendaria: 5 }, w: { comum: 30, rara: 35, epica: 25, lendaria: 7, dourada: 3 }, divineChance: 50, secretChance: 8 },
    },
    // Calendário de 7 dias (volta ao dia 1 depois). A cada semana completa, o dia 7 melhora.
    DAILY: [ { coins: 300 }, { chest: 'madeira' }, { gems: 5 }, { chest: 'prata' }, { coins: 1500 }, { chest: 'ouro' }, { chest: 'magico', gems: 10 } ],
    // dia 7 das semanas seguintes (sequência sem falhar)
    DAILY_BIG: [ 'magico', 'lendario', 'magico', 'lendario', 'divino' ],
    // Caminho de recompensas: baús especiais ao vencer certas fases pela 1ª vez
    milestone: (level) => { const i = (level - 1) % 40 + 1, w = Math.floor((level - 1) / 40); return level === 3 ? 'prata' : i === 20 ? (w >= 2 ? 'magico' : 'ouro') : i === 40 ? (w >= 3 ? 'divino' : 'lendario') : i === 30 ? 'ouro' : null; },
  };

  return { SECRET_TOWERS, FAMILIES, isBossLevel, RARITIES, RARITY_IDS, ATK, partsOf, towerMaxHp, repairCost, TRAPS, GEM_ROCK_COST, GEMS_PER_ROCK, hasSecret, tierOf, worldInfo, mobsAt, WORLDS, LEVELS_PER_WORLD, COLS, ROWS, CELL, TPS, START_LIVES, MAX_TICKS, TOWERS, TOWER_IDS, ENEMIES, MAX_TLVL, MAX_PERM, ECON,
    createGame, applyAction, step, replay, stars, towerStats, upgradeCost, canUse, genPath };
});
