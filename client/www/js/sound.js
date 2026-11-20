/*
 * SOM DO JOGO — tudo gerado pelo navegador (Web Audio), sem arquivos de áudio: o jogo continua leve.
 *  - Efeitos: tiros de cada arma, monstros, chefões, torres destruídas, baús, cartas, vitória/derrota.
 *  - Música sombria diferente em cada mundo.
 *  - Botão 🔊 / 🎵 / 🔇 (o jogador escolhe; fica salvo no aparelho).
 * Celulares só liberam som depois do 1º toque na tela: o som começa a partir daí.
 */
(function () {
  'use strict';
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  // modo: 2 = som + música, 1 = só efeitos, 0 = mudo
  let mode = LS.get('rg_sound') === null ? 2 : Number(LS.get('rg_sound')) | 0;
  let ac = null, master, sfxBus, musBus, noiseBuf, unlocked = false;

  function init() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = mode >= 1 ? 0.55 : 0; sfxBus.connect(master);
    musBus = ac.createGain(); musBus.gain.value = mode === 2 ? 0.32 : 0; musBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  function unlock() {
    if (!init()) return;
    if (ac.state === 'suspended') ac.resume();
    if (!unlocked) { unlocked = true; if (wantTheme !== null) startMusic(wantTheme); }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, unlock, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else if (unlocked) ac.resume(); });

  // ---------- blocos de som ----------
  const now = () => ac.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function tone(o) {   // {type, f, f2, t, a, d, v, bus, det}
    const t = o.t || now(), osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a || .005) + o.d);
    if (o.det) osc.detune.value = o.det;
    env(g, t, o.a || .005, o.v || .3, o.d);
    osc.connect(g); g.connect(o.bus || sfxBus); osc.start(t); osc.stop(t + (o.a || .005) + o.d + .05);
  }
  function noise(o) {  // {t, d, v, filter, f, f2, q, a}
    const t = o.t || now(), src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    fl.type = o.filter || 'lowpass'; fl.frequency.setValueAtTime(o.f || 1000, t); fl.Q.value = o.q || 1;
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a || .005) + o.d);
    env(g, t, o.a || .005, o.v || .3, o.d);
    src.connect(fl); fl.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * .5); src.stop(t + (o.a || .005) + o.d + .05);
  }
  // limita a quantidade de sons (no 3x de velocidade com 20 torres viraria barulho)
  const lastAt = {}; let voices = 0;
  function ok(key, gapMs) {
    if (!ac || !unlocked || mode === 0 || ac.state !== 'running') return false;
    const t = performance.now();
    if (lastAt[key] && t - lastAt[key] < gapMs) return false;
    if (voices > 14) return false;
    lastAt[key] = t; voices++; setTimeout(() => voices--, 160);
    return true;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- TIROS (um som para cada estilo de arma) ----------
  const SHOT = {
    arqueiro: () => { noise({ filter: 'highpass', f: 3000, d: .05, v: .18 }); tone({ type: 'triangle', f: rnd(900, 1100), f2: 500, d: .06, v: .08 }); },
    gelo: () => { tone({ type: 'sine', f: rnd(1800, 2200), f2: 900, d: .18, v: .12 }); tone({ type: 'sine', f: 3200, d: .12, v: .05, t: now() + .03 }); },
    canhao: () => { tone({ type: 'sine', f: 120, f2: 40, d: .3, v: .5 }); noise({ f: 900, f2: 120, d: .3, v: .35 }); },
    lanceiro: () => noise({ filter: 'bandpass', f: 1800, f2: 600, q: 2, d: .12, v: .25 }),
    mago: () => { const b = rnd(500, 700); [1, 1.5, 2].forEach((m, i) => tone({ type: 'triangle', f: b * m, d: .1, v: .08, t: now() + i * .03 })); },
    dragao: () => noise({ f: 1400, f2: 300, d: .35, v: .3, a: .03 }),
    raio: () => { tone({ type: 'sawtooth', f: rnd(800, 1600), f2: 120, d: .12, v: .14 }); noise({ filter: 'highpass', f: 2500, d: .08, v: .15 }); },
    raioceu: () => { noise({ filter: 'highpass', f: 1500, d: .05, v: .35 }); tone({ type: 'sawtooth', f: 200, f2: 50, d: .4, v: .25 }); noise({ f: 400, d: .5, v: .3, a: .02 }); },
    feixe: () => tone({ type: 'sine', f: rnd(600, 700), f2: 1200, d: .08, v: .07 }),
    feixeolho: () => { tone({ type: 'sawtooth', f: 90, d: .15, v: .12 }); tone({ type: 'sine', f: 1400, f2: 700, d: .12, v: .06 }); },
    veneno: () => { for (let i = 0; i < 3; i++) tone({ type: 'sine', f: rnd(250, 500), f2: rnd(600, 900), d: .05, v: .08, t: now() + i * .045 }); },
    vento: () => noise({ filter: 'bandpass', f: 400, f2: 2200, q: 3, d: .3, v: .22, a: .05 }),
    agua: () => { tone({ type: 'sine', f: 300, f2: 900, d: .12, v: .12 }); noise({ filter: 'bandpass', f: 1200, q: 1.5, d: .15, v: .12 }); },
    corte: () => noise({ filter: 'bandpass', f: 4000, f2: 1200, q: 4, d: .1, v: .3 }),
    onda: () => { [1, 2.76, 5.4].forEach((m, i) => tone({ type: 'sine', f: 330 * m, d: .8 - i * .2, v: .1 / (i + 1) })); },
    meteoro: () => { noise({ f: 3000, f2: 200, d: .45, v: .3, a: .05 }); tone({ type: 'sine', f: 90, f2: 30, d: .5, v: .5, t: now() + .4 }); },
  };
  // ---------- EFEITOS ----------
  const FX = {
    die: () => { tone({ type: 'square', f: rnd(300, 420), f2: 80, d: .12, v: .07 }); noise({ f: 1200, f2: 300, d: .08, v: .12 }); },
    bossDie: () => { tone({ type: 'sawtooth', f: 160, f2: 30, d: 1.2, v: .35 }); noise({ f: 1500, f2: 100, d: 1.2, v: .4, a: .02 }); [0, .15, .3].forEach(dt => tone({ type: 'sine', f: 70, f2: 30, d: .4, v: .4, t: now() + dt })); },
    boss: () => { tone({ type: 'sawtooth', f: 55, f2: 45, d: 1.4, v: .35, a: .2 }); tone({ type: 'sawtooth', f: 82, f2: 60, d: 1.4, v: .25, a: .2, det: 15 }); noise({ f: 300, d: 1.2, v: .25, a: .3 }); },
    matk: () => tone({ type: 'sawtooth', f: rnd(120, 180), f2: 70, d: .15, v: .1 }),
    tdie: () => { noise({ f: 2500, f2: 80, d: .9, v: .6, a: .01 }); tone({ type: 'sine', f: 110, f2: 30, d: .7, v: .6 }); },
    boom: () => { noise({ f: 1800, f2: 100, d: .6, v: .5 }); tone({ type: 'sine', f: 100, f2: 35, d: .5, v: .5 }); },
    spike: () => { tone({ type: 'square', f: 900, f2: 300, d: .06, v: .1 }); noise({ filter: 'highpass', f: 2000, d: .06, v: .15 }); },
    revive: () => { tone({ type: 'sine', f: 200, f2: 600, d: .5, v: .12, a: .1 }); },
    summon: () => { tone({ type: 'triangle', f: 150, f2: 400, d: .35, v: .12 }); tone({ type: 'triangle', f: 225, f2: 600, d: .35, v: .08 }); },
    part: () => [392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f, d: .25, v: .15, t: now() + i * .09 })),
    build: () => { tone({ type: 'square', f: 200, f2: 120, d: .08, v: .12 }); tone({ type: 'triangle', f: 600, d: .12, v: .1, t: now() + .06 }); },
    up: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f, d: .12, v: .1, t: now() + i * .05 })),
    sell: () => [880, 660].forEach((f, i) => tone({ type: 'sine', f, d: .1, v: .12, t: now() + i * .06 })),
    wave: () => { tone({ type: 'sawtooth', f: 110, d: .5, v: .12, a: .05 }); tone({ type: 'sawtooth', f: 165, d: .5, v: .1, a: .05, t: now() + .2 }); },
    ui: () => tone({ type: 'sine', f: 700, f2: 500, d: .04, v: .06 }),
    coin: () => { tone({ type: 'square', f: 988, d: .06, v: .08 }); tone({ type: 'square', f: 1319, d: .25, v: .08, t: now() + .07 }); },
    gems: () => [1319, 1568, 2093, 2637].forEach((f, i) => tone({ type: 'sine', f, d: .3, v: .1, t: now() + i * .06 })),
    chest: () => { noise({ f: 500, f2: 2500, d: .5, v: .25, a: .2 }); tone({ type: 'square', f: 150, f2: 80, d: .15, v: .15, t: now() + .55 }); [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, d: .4, v: .1, t: now() + .6 + i * .06 })); },
    win: () => { const n = [523, 659, 784, 1047, 784, 1047]; n.forEach((f, i) => tone({ type: 'triangle', f, d: i === 5 ? .8 : .18, v: .18, t: now() + i * .14 })); tone({ type: 'sine', f: 262, d: 1.2, v: .15, t: now() + .7 }); },
    lose: () => [392, 370, 349, 262].forEach((f, i) => tone({ type: 'sawtooth', f, f2: i === 3 ? 180 : 0 || undefined, d: i === 3 ? 1 : .3, v: .12, t: now() + i * .3 })),
    pay: () => { FX.coin(); setTimeout(() => FX.gems(), 200); },
  };
  // carta revelada: quanto mais rara, mais brilhante
  const RARE = { comum: 0, rara: 1, 'épica': 2, epica: 2, 'lendária': 3, lendaria: 3, dourada: 4, divina: 5, secreta: 5 };
  function card(rar) {
    if (!ok('card', 60)) return;
    const lv = RARE[rar] | 0, base = [440, 523, 587, 659, 784, 880][lv];
    for (let i = 0; i <= lv + 1; i++) tone({ type: lv >= 4 ? 'sine' : 'triangle', f: base * [1, 1.25, 1.5, 2, 2.5, 3, 4][i], d: .25 + lv * .08, v: .1, t: now() + i * .06 });
    if (lv >= 4) { noise({ filter: 'highpass', f: 6000, d: 1.2, v: .08, a: .1 }); [1, 1.5, 2].forEach(m => tone({ type: 'sine', f: 220 * m, d: 1.6, v: .07, a: .3 })); }
  }

  // ---------- MÚSICA (uma para cada mundo) ----------
  // escalas em semitons; raiz em Hz; bpm; timbre; extras
  const MIN = [0, 2, 3, 5, 7, 8, 10], PHR = [0, 1, 3, 5, 7, 8, 10], HAR = [0, 2, 3, 5, 7, 8, 11], LOC = [0, 1, 3, 5, 6, 8, 10];
  const THEMES = [
    { root: 110, sc: MIN, bpm: 70, lead: 'triangle', pad: 'sine', drum: 0, air: 'vagalume' },     // Floresta dos Mistérios
    { root: 98, sc: HAR, bpm: 84, lead: 'sawtooth', pad: 'triangle', drum: 1, air: 'vento' },      // Deserto dos Faraós
    { root: 87, sc: PHR, bpm: 62, lead: 'triangle', pad: 'sine', drum: 0, air: 'pantano' },        // Pântano dos Mortos
    { root: 123, sc: MIN, bpm: 66, lead: 'sine', pad: 'sine', drum: 0, air: 'vento', bell: 1 },    // Gelo Encantado
    { root: 82, sc: PHR, bpm: 96, lead: 'sawtooth', pad: 'sawtooth', drum: 2, air: 'fogo' },       // Subterrâneo de Fogo
    { root: 104, sc: HAR, bpm: 74, lead: 'triangle', pad: 'triangle', drum: 1, air: 'mar' },       // Ilha Maldita
    { root: 92, sc: LOC, bpm: 58, lead: 'sine', pad: 'triangle', drum: 0, air: 'vento', bell: 1 }, // Cemitério Assombrado
    { root: 130, sc: MIN, bpm: 78, lead: 'sine', pad: 'sine', drum: 0, air: 'gota', bell: 1 },     // Cavernas de Cristal
    { root: 98, sc: PHR, bpm: 100, lead: 'sawtooth', pad: 'triangle', drum: 2, air: 'chuva' },     // Céu da Tempestade
    { root: 73, sc: LOC, bpm: 90, lead: 'sawtooth', pad: 'sawtooth', drum: 2, air: 'fogo' },       // Inferno
  ];
  const MENU = { root: 98, sc: MIN, bpm: 64, lead: 'triangle', pad: 'sine', drum: 0, air: null, bell: 1 };
  let wantTheme = null, curTheme = null, timer = null, nextT = 0, stepN = 0, seed = 1, battle = false;
  const hz = (th, deg, oct) => th.root * Math.pow(2, (th.sc[((deg % 7) + 7) % 7] + 12 * (oct + Math.floor(deg / 7))) / 12);
  const srand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function playStep(th, t) {
    const beat = 60 / th.bpm / 2, bar = stepN % 16, B = musBus;
    // acorde grave (troca a cada 2 compassos): i – VI – iv – V
    const prog = [0, 5, 3, 4], ch = prog[Math.floor(stepN / 16) % 4];
    if (bar === 0) {
      [0, 2, 4].forEach((d, i) => tone({ type: th.pad, f: hz(th, ch + d, i === 0 ? -1 : 0), a: .8, d: beat * 15, v: th.pad === 'sawtooth' ? .035 : .07, bus: B, det: i * 4 }));
      tone({ type: 'sine', f: hz(th, ch, -2), a: .3, d: beat * 15, v: .12, bus: B });
    }
    // melodia esparsa e misteriosa
    if (srand() < (battle ? .45 : .3) && bar % 2 === 0) {
      const deg = ch + [0, 2, 4, 6, 7, 4, 2][Math.floor(srand() * 7)];
      tone({ type: th.lead, f: hz(th, deg, 1), a: .02, d: beat * (1.5 + srand() * 2), v: th.lead === 'sawtooth' ? .03 : .06, bus: B, det: srand() * 10 - 5 });
      if (th.bell) tone({ type: 'sine', f: hz(th, deg, 2) * 2.76, a: .005, d: 1.2, v: .015, bus: B, t });
    }
    // percussão (tambores de guerra nos mundos quentes)
    if (th.drum && battle) {
      if (bar % 8 === 0 || (th.drum === 2 && bar % 8 === 6)) tone({ type: 'sine', f: 70, f2: 40, d: .35, v: .25, bus: B, t });
      if (bar % 4 === 2) noise({ filter: 'bandpass', f: th.drum === 2 ? 1800 : 900, q: 1, d: .08, v: .07, bus: B, t });
    }
    // ambiente
    if (bar === 8 && srand() < .5) {
      if (th.air === 'vento' || th.air === 'chuva') noise({ filter: 'bandpass', f: 500, f2: 1200, q: 2, a: 1.5, d: 3, v: .05, bus: B, t });
      else if (th.air === 'fogo') noise({ f: 300, a: .8, d: 2.5, v: .08, bus: B, t });
      else if (th.air === 'mar') noise({ f: 600, f2: 200, a: 1.2, d: 2.5, v: .07, bus: B, t });
      else if (th.air === 'gota') tone({ type: 'sine', f: 1800 + srand() * 800, f2: 900, d: .15, v: .04, bus: B, t });
      else if (th.air === 'pantano') tone({ type: 'sine', f: 180, f2: 120, d: .25, v: .05, bus: B, t });
      else if (th.air === 'vagalume') tone({ type: 'sine', f: 2400 + srand() * 600, d: .2, v: .02, bus: B, t });
    }
    stepN++;
  }
  function startMusic(themeIdx) {
    wantTheme = themeIdx;
    if (!ac || !unlocked) return;
    if (curTheme === themeIdx && timer) return;
    stopMusic();
    curTheme = themeIdx; stepN = 0; seed = 7 + (themeIdx | 0) * 101;
    const th = themeIdx === -1 ? MENU : THEMES[themeIdx % THEMES.length];
    nextT = ac.currentTime + .1;
    timer = setInterval(() => {
      if (mode !== 2 || ac.state !== 'running') { nextT = ac.currentTime + .1; return; }
      while (nextT < ac.currentTime + .25) { playStep(th, nextT); nextT += 60 / th.bpm / 2; }
    }, 60);
  }
  function stopMusic() { clearInterval(timer); timer = null; curTheme = null; }

  // ---------- botão de som ----------
  const ICON = ['🔇', '🔉', '🔊'], TXT = ['Som desligado', 'Só efeitos (sem música)', 'Som e música ligados'];
  function setMode(m) {
    mode = m; LS.set('rg_sound', String(m));
    if (ac) { sfxBus.gain.value = m >= 1 ? 0.55 : 0; musBus.gain.value = m === 2 ? 0.32 : 0; }
    document.querySelectorAll('.snd-btn').forEach(b => { b.textContent = ICON[m]; b.title = TXT[m]; });
  }
  function button() {
    const b = document.createElement('button');
    b.className = 'snd-btn icon'; b.type = 'button'; b.textContent = ICON[mode]; b.title = TXT[mode];
    b.addEventListener('click', (e) => { e.stopPropagation(); unlock(); setMode((mode + 2) % 3); if (window.__toast) window.__toast(ICON[mode] + ' ' + TXT[mode]); if (mode) FX.ui(); });
    return b;
  }
  // som de clique em qualquer botão do jogo
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button,.lv,[data-go]'); if (b && !b.classList.contains('snd-btn') && ok('ui', 50)) FX.ui(); }, true);

  window.Sound = {
    shot(style) { if (SHOT[style] && ok('s:' + style, style === 'feixe' || style === 'feixeolho' ? 140 : 70)) SHOT[style](); },
    fx(name) { if (FX[name] && ok('f:' + name, name === 'die' ? 45 : name === 'matk' ? 90 : 30)) FX[name](); },
    card,
    music(themeIdx, inBattle) { battle = !!inBattle; startMusic(themeIdx); },
    button, setMode, get mode() { return mode; },
  };
})();
