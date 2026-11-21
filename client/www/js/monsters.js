/* Monstrinhos VISTOS DE CIMA (top-down). Só visual — não muda o jogo.
 * Cada desenho é feito olhando para a direita (+x); o corpo inteiro gira para a direção do caminho.
 * Andando: pés dão passos para frente/trás e os braços balançam ao contrário das pernas. */
(function () {
  'use strict';
  const TIER = [null, '#cd7f32', '#dee2e6', '#ffd43b', '#66d9e8'];   // armadura: bronze, prata, ouro, diamante
  let c;

  // ---------- auxiliares ----------
  function ell(x, y, rx, ry, col, rot) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, 7); c.fill(); }
  function circ(x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, Math.abs(r), 0, 7); c.fill(); }
  function line(x1, y1, x2, y2, w, col) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function poly(pts, col) { c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }
  function outline(w, col) { c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
  const shade = (hex, f) => { if (hex[0] !== '#') return hex; const n = parseInt(hex.slice(1), 16); const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };

  // olhos na frente da cabeça (vistos de cima dá pra ver os olhinhos na borda da frente)
  // olhos ASSUSTADORES: fundo escuro, pupila brilhando (vermelha) e presas afiadas na frente
  function eyes(hx, hr, u, angry, col) {
    const ex = hx + hr * .58, ey = hr * .4, glow = col && col !== '#212529' ? col : '#ff2b2b';
    // presas
    poly([[hx + hr * .82, -hr * .32], [hx + hr * 1.28, -hr * .22], [hx + hr * .88, -hr * .08]], '#f8f9fa');
    poly([[hx + hr * .82, hr * .32], [hx + hr * 1.28, hr * .22], [hx + hr * .88, hr * .08]], '#f8f9fa');
    circ(ex, -ey, hr * .3, '#1a0606'); circ(ex, ey, hr * .3, '#1a0606');
    c.save(); c.shadowColor = glow; c.shadowBlur = 5;
    ell(ex + hr * .08, -ey, hr * .17, hr * .1, glow, -.4); ell(ex + hr * .08, ey, hr * .17, hr * .1, glow, .4);
    c.restore();
    // sobrancelhas sempre bravas
    line(ex - hr * .3, -ey - hr * .38, ex + hr * .25, -ey - hr * .08, 2 * u, '#000'); line(ex - hr * .3, ey + hr * .38, ex + hr * .25, ey + hr * .08, 2 * u, '#000');
  }
  function helmet(hx, hr, tier) {         // capacete visto de cima (cobre a parte de trás da cabeça)
    if (!tier) return;
    c.fillStyle = TIER[tier]; c.beginPath(); c.arc(hx, 0, hr * 1.05, Math.PI * .55, Math.PI * 1.45); c.closePath(); c.fill();
    c.beginPath(); c.arc(hx, 0, hr * .45, 0, 7); c.fill();
    if (tier >= 3) circ(hx - hr * .2, 0, hr * .2, '#fff');
  }

  /* BÍPEDE visto de cima. spec: skin, cloth, feet, bodyRx, bodyRy, headR, arms ('swing'|'forward'|'none'), hand(fn), head(fn), back(fn) */
  function biped(e, u, w, o, sp) {
    const s = Math.sin(w * (sp.speed || 2.2));
    const bx = sp.bodyRx * u, by = sp.bodyRy * u, hr = sp.headR * u, step = (sp.step || 8) * u;
    // pés (passos para frente e para trás)
    ell(s * step, -by * .45, 5 * u, 3.5 * u, sp.feet);
    ell(-s * step, by * .45, 5 * u, 3.5 * u, sp.feet);
    if (sp.back) sp.back(s);
    // braços balançando ao contrário das pernas
    const armL = sp.armLen || 11;
    const hand = (side, sw) => {
      const sx = 0, sy = side * by * .9;
      let hx, hy;
      if (sp.arms === 'forward') { hx = (armL + 2) * u + sw * 2 * u; hy = side * by * .75; }
      else { hx = sw * armL * u; hy = side * (by + 4 * u); }
      line(sx, sy, hx, hy, (sp.armW || 5) * u, sp.skin);
      circ(hx, hy, (sp.handR || 3.5) * u, shade(sp.skin, .9));
      return [hx, hy];
    };
    let hL = null, hR = null;
    if (sp.arms !== 'none') { hL = hand(-1, -s); hR = hand(1, s); }
    // corpo (ombros)
    ell(0, 0, bx, by, sp.cloth);
    if (sp.body) sp.body(s, bx, by);
    if (sp.hand && hR) sp.hand(hR[0], hR[1], s);
    // cabeça
    const hx = (sp.headX || 2) * u;
    ell(hx, 0, hr, hr, o.col);
    if (sp.head) sp.head(hx, hr, s);
    eyes(hx, hr, u, sp.angry);
    helmet(hx, hr, o.tier);
  }

  /* QUADRÚPEDE visto de cima: 4 patas em diagonal, cabeça na frente, rabo atrás balançando */
  function quad(e, u, w, o, sp) {
    const s = Math.sin(w * (sp.speed || 2.6)), L = sp.len * u, W = sp.wid * u, step = (sp.step || 6) * u;
    const legs = [[L * .55, -W, s], [L * .55, W, -s], [-L * .55, -W, -s], [-L * .55, W, s]];
    for (const [lx, ly, ph] of legs) { line(lx, ly * .6, lx + ph * step, ly * 1.15, (sp.legW || 4.5) * u, sp.leg); ell(lx + ph * step, ly * 1.15, 3.5 * u, 2.6 * u, shade(sp.leg, .8)); }
    if (sp.tail) sp.tail(L, W, s);
    ell(0, 0, L, W, o.col);
    if (sp.body) sp.body(L, W, s);
    const hx = L + (sp.neck || 4) * u, hr = sp.headR * u;
    if (sp.head) sp.head(hx, hr, s); else ell(hx, 0, hr, hr * .85, o.col);
    if (!sp.noEyes) eyes(hx, hr, u, sp.angry, sp.eyeCol);
    helmet(hx - hr * .2, hr * .8, o.tier);
  }

  /* VOADOR: asas abertas para os lados batendo; sombra no chão */
  function flyer(e, u, o, sp) {
    const f = Math.sin(o.t * (sp.flap || 14) + e.id);
    const span = (sp.span || 30) * u * (.55 + Math.abs(f) * .45);
    for (const sd of [-1, 1]) {
      const pts = sp.wingShape ? sp.wingShape(sd, span) : [[4 * u, sd * 4 * u], [-2 * u, sd * span], [-12 * u, sd * span * .8], [-8 * u, sd * span * .45], [-10 * u, sd * 5 * u]];
      poly(pts, sp.wing);
      if (sp.wing2) poly(pts.map(([x, y]) => [x * .7, y * .65]), sp.wing2);
    }
    if (sp.tail) sp.tail(f);
    ell(0, 0, sp.bodyRx * u, sp.bodyRy * u, o.col);
    if (sp.body) sp.body(f);
    const hx = (sp.headX || 10) * u, hr = sp.headR * u;
    ell(hx, 0, hr, hr, sp.headCol || o.col);
    if (sp.head) sp.head(hx, hr);
    if (!sp.noEyes) eyes(hx, hr, u, sp.angry, sp.eyeCol);
    helmet(hx, hr, o.tier);
  }

  /* RASTEJANTE com várias patinhas (escorpião, besouro) */
  function bug(u, w, nLegs, len, col, legCol) {
    const s = Math.sin(w * 4);
    for (let i = 0; i < nLegs; i++) {
      const lx = len * (.6 - 1.2 * i / Math.max(1, nLegs - 1)) * u, ph = (i % 2 ? s : -s) * 4 * u;
      for (const sd of [-1, 1]) {
        const k1 = [lx + ph * sd, sd * 13 * u], k2 = [lx + ph * sd - 3 * u, sd * 19 * u];
        line(lx, sd * 5 * u, k1[0], k1[1], 2.4 * u, legCol); line(k1[0], k1[1], k2[0], k2[1], 2 * u, legCol);
      }
    }
  }

  const DRAW = {
    // ================== FLORESTA ==================
    slime(e, u, w, o) {
      const p = Math.sin(w * 2.4), sx = 1 + p * .12, sy = 1 - p * .1;
      ell(-14 * u * (1 + p * .3), 0, 6 * u, 10 * u, 'rgba(0,0,0,.12)');            // rastro gosmento
      ell(0, 0, 22 * u * sx, 20 * u * sy, o.col);
      ell(-6 * u, -7 * u, 7 * u, 4 * u, 'rgba(255,255,255,.55)', -.4);
      eyes(4 * u, 14 * u, u, false);
      helmet(-4 * u, 12 * u, o.tier);
    },
    goblin(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: '#8d5524', feet: '#5c3d2e', bodyRx: 9, bodyRy: 13, headR: 10.5, speed: 2.8, step: 10, armW: 5.5,
        hand: (x, y, s) => line(x, y, x + 10 * u, y + 2 * u, 2.5 * u, '#ced4da'),
        head: (hx, hr) => { poly([[hx - 2 * u, -hr * .7], [hx - 10 * u, -hr * 1.9], [hx + 3 * u, -hr * .9]], o.col); poly([[hx - 2 * u, hr * .7], [hx - 10 * u, hr * 1.9], [hx + 3 * u, hr * .9]], o.col);
          circ(hx + hr * .95, 0, 2.5 * u, shade(o.base, .8)); }, angry: true });
    },
    lobo(e, u, w, o) {
      quad(e, u, w, o, { len: 17, wid: 8, headR: 8, leg: shade(o.base, .75), speed: 3.2, step: 8,
        tail: (L, W, s) => { c.save(); c.translate(-L, 0); c.rotate(Math.sin(o.t * 8 + e.id) * .5); ell(-9 * u, 0, 10 * u, 3.5 * u, o.col); c.restore(); },
        body: (L, W) => ell(-2 * u, 0, L * .7, W * .45, shade(o.base, 1.15)),
        head: (hx, hr) => { ell(hx, 0, hr, hr * .85, o.col); ell(hx + hr, 0, hr * .7, hr * .45, shade(o.base, 1.1)); circ(hx + hr * 1.6, 0, 2 * u, '#212529');
          poly([[hx - 4 * u, -hr * .5], [hx - 9 * u, -hr * 1.3], [hx, -hr * .8]], shade(o.base, .8)); poly([[hx - 4 * u, hr * .5], [hx - 9 * u, hr * 1.3], [hx, hr * .8]], shade(o.base, .8)); },
        eyeCol: '#f59f00' });
      if (o.dash) for (let i = 0; i < 3; i++) line(-30 * u - i * 5 * u, (i - 1) * 6 * u, -40 * u - i * 5 * u, (i - 1) * 6 * u, 2 * u, 'rgba(255,255,255,.7)');
    },
    morcego(e, u, w, o) {
      flyer(e, u, o, { span: 26, wing: shade(o.base, .65), wing2: shade(o.base, .85), bodyRx: 8, bodyRy: 7, headR: 7, headX: 7, flap: 18, eyeCol: '#fa5252',
        wingShape: (sd, sp) => [[3 * u, sd * 4 * u], [6 * u, sd * sp], [-2 * u, sd * sp * .75], [-6 * u, sd * sp], [-8 * u, sd * sp * .5], [-6 * u, sd * 4 * u]],
        head: (hx, hr) => { poly([[hx - 2 * u, -hr * .6], [hx - 4 * u, -hr * 1.6], [hx + 2 * u, -hr * .8]], o.col); poly([[hx - 2 * u, hr * .6], [hx - 4 * u, hr * 1.6], [hx + 2 * u, hr * .8]], o.col); } });
    },
    ogro(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: '#5c3d2e', feet: shade(o.base, .55), bodyRx: 14, bodyRy: 19, headR: 12, speed: 1.6, step: 10, armW: 8, handR: 5, armLen: 14,
        body: () => ell(2 * u, 0, 10 * u, 13 * u, shade(o.base, 1.15)),
        hand: (x, y, s) => { c.save(); c.translate(x, y); c.rotate(-.4 + Math.sin(o.t * 3 + e.id) * .7); line(0, 0, 22 * u, 0, 5 * u, '#7c4a1e'); ell(26 * u, 0, 8 * u, 6 * u, '#8d5524'); circ(27 * u, -4 * u, 1.8 * u, '#dee2e6'); circ(28 * u, 4 * u, 1.8 * u, '#dee2e6'); c.restore(); },
        head: (hx, hr) => { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; poly([[hx + Math.cos(a) * hr * .55, Math.sin(a) * hr * .55], [hx + Math.cos(a + .3) * hr * 1.05, Math.sin(a + .3) * hr * 1.05], [hx + Math.cos(a - .3) * hr * 1.05, Math.sin(a - .3) * hr * 1.05]], '#ffd43b'); } circ(hx, 0, hr * .5, o.col); circ(hx, 0, 2.5 * u, '#e03131'); },
        angry: true });
    },
    // ================== DESERTO ==================
    escorpiao(e, u, w, o) {
      bug(u, w, 4, 12, shade(o.base, .7), shade(o.base, .7));
      // cauda curvada por cima das costas
      const t = Math.sin(o.t * 3 + e.id) * .25;
      for (let i = 0; i < 5; i++) { const a = Math.PI + t + i * .38; circ(-10 * u + Math.cos(a) * i * 3 * u - i * 3 * u, Math.sin(a) * i * 3.5 * u, (6 - i * .7) * u, i % 2 ? o.col : shade(o.base, .85)); }
      poly([[-6 * u, 9 * u], [-1 * u, 13 * u], [-6 * u, 15 * u]], '#212529');
      ell(0, 0, 15 * u, 10 * u, o.col);
      for (let i = 0; i < 3; i++) line((-8 + i * 7) * u, -8 * u, (-8 + i * 7) * u, 8 * u, 1.2 * u, shade(o.base, .7));
      // pinças abrindo e fechando
      const p = Math.abs(Math.sin(o.t * 5 + e.id)) * .5;
      for (const sd of [-1, 1]) { line(10 * u, sd * 6 * u, 20 * u, sd * 12 * u, 4 * u, o.col); c.save(); c.translate(22 * u, sd * 12 * u); ell(4 * u, 0, 6 * u, 4 * u, shade(o.base, 1.1)); c.rotate(sd * p); ell(5 * u, sd * -3 * u, 5 * u, 2 * u, shade(o.base, .9)); c.restore(); }
      eyes(10 * u, 6 * u, u, true);
      if (e.shield > 0) { c.globalAlpha = .3; ell(0, 0, 20 * u, 15 * u, '#ffd43b'); c.globalAlpha = 1; }
      helmet(4 * u, 7 * u, o.tier);
    },
    mumia(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: o.col, feet: shade(o.base, .8), bodyRx: 9, bodyRy: 12, headR: 9.5, speed: 1.6, step: 7, arms: 'forward', armLen: 14,
        body: (s, bx, by) => { for (let i = -2; i <= 2; i++) line(-bx * .8, i * 4.5 * u, bx * .8, i * 4.5 * u + 2 * u, 1.2 * u, shade(o.base, .7)); line(-bx, by * .3, -bx - 10 * u, by * .3 + s * 4 * u, 2 * u, o.col); },
        head: (hx, hr) => { line(hx - hr, -hr * .3, hx + hr, hr * .1, 1.2 * u, shade(o.base, .7)); line(hx - hr, hr * .4, hx + hr * .8, hr * .6, 1.2 * u, shade(o.base, .7)); } });
      if (e.revived) { c.globalAlpha = .5; circ(14 * u, -4 * u, 2 * u, '#ff6b6b'); circ(14 * u, 4 * u, 2 * u, '#ff6b6b'); c.globalAlpha = 1; }
    },
    besouro(e, u, w, o) {
      bug(u, w, 3, 10, '#212529', '#212529');
      ell(0, 0, 15 * u, 12 * u, o.col);
      line(-14 * u, 0, 8 * u, 0, 1.5 * u, shade(o.base, .55));
      ell(-4 * u, -5 * u, 6 * u, 3 * u, 'rgba(255,255,255,.35)', -.2);
      ell(14 * u, 0, 6 * u, 7 * u, '#212529');
      line(18 * u, -3 * u, 26 * u, -9 * u + Math.sin(o.t * 6) * 2 * u, 1.5 * u, '#212529'); line(18 * u, 3 * u, 26 * u, 9 * u - Math.sin(o.t * 6) * 2 * u, 1.5 * u, '#212529');
      circ(17 * u, -3 * u, 1.6 * u, '#ffe066'); circ(17 * u, 3 * u, 1.6 * u, '#ffe066');
      helmet(12 * u, 5 * u, o.tier);
    },
    abutre(e, u, w, o) {
      flyer(e, u, o, { span: 34, wing: shade(o.base, .6), wing2: shade(o.base, .85), bodyRx: 11, bodyRy: 8, headR: 6, headX: 13, flap: 7, headCol: '#f4a6a6',
        tail: () => poly([[-10 * u, -5 * u], [-20 * u, 0], [-10 * u, 5 * u]], shade(o.base, .7)),
        body: () => ell(6 * u, 0, 5 * u, 7 * u, '#f8f0e3'),
        head: (hx, hr) => poly([[hx + hr * .8, -2 * u], [hx + hr * 2, 0], [hx + hr * .8, 2 * u]], '#ffd43b') });
    },
    farao(e, u, w, o) {
      biped(e, u, w, o, { skin: '#d9a066', cloth: '#f8f9fa', feet: '#7c4a1e', bodyRx: 13, bodyRy: 18, headR: 11, speed: 1.5, step: 10, armW: 7, handR: 4.5, armLen: 13,
        body: (s, bx, by) => { ell(0, 0, bx * .7, by * .7, '#d9a066'); poly([[-bx * .5, -by * .4], [bx * .4, 0], [-bx * .5, by * .4]], '#1c7ed6'); },
        hand: (x, y) => { line(x - 14 * u, y, x + 18 * u, y, 3 * u, '#ffd43b'); circ(x + 20 * u, y, 4.5 * u, '#1c7ed6'); },
        back: () => { poly([[-2 * u, -14 * u], [-20 * u, -16 * u], [-20 * u, 16 * u], [-2 * u, 14 * u]], o.col); for (let i = -3; i <= 3; i++) line(-19 * u, i * 4.5 * u, -2 * u, i * 3.5 * u, 1.6 * u, '#1c7ed6'); },
        head: (hx, hr) => { c.fillStyle = o.col; c.beginPath(); c.arc(hx, 0, hr * 1.05, Math.PI * .5, Math.PI * 1.5); c.fill(); circ(hx + hr * .5, 0, 2.5 * u, '#e03131'); },
        angry: true });
    },
    // ================== PÂNTANO ==================
    sapo(e, u, w, o) {
      const hop = Math.max(0, Math.sin(w * 1.6)), st = hop * 7 * u;
      // pernas de trás dobradas que esticam no pulo
      for (const sd of [-1, 1]) { ell(-10 * u - st, sd * 12 * u, 9 * u, 5 * u, shade(o.base, .8), sd * .5); ell(-16 * u - st * 1.6, sd * 15 * u, 5 * u, 4 * u, shade(o.base, .7)); ell(10 * u + st * .4, sd * 11 * u, 4 * u, 3 * u, shade(o.base, .8)); }
      ell(0, 0, 17 * u * (1 + hop * .1), 15 * u, o.col);
      circ(-4 * u, -6 * u, 2.4 * u, shade(o.base, .7)); circ(-8 * u, 5 * u, 2 * u, shade(o.base, .7)); circ(2 * u, 2 * u, 1.6 * u, shade(o.base, .7));
      for (const sd of [-1, 1]) { circ(9 * u, sd * 7 * u, 6 * u, o.col); circ(10 * u, sd * 7 * u, 4 * u, '#fff'); circ(11.5 * u, sd * 7 * u, 2 * u, '#212529'); }
      c.strokeStyle = '#2b5a0a'; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(8 * u, 0, 8 * u, -.9, .9); c.stroke();
      helmet(-2 * u, 9 * u, o.tier);
    },
    mosquito(e, u, w, o) {
      flyer(e, u, o, { span: 20, wing: 'rgba(231,245,255,.7)', bodyRx: 6, bodyRy: 5, headR: 5, headX: 8, flap: 40, eyeCol: '#fa5252',
        wingShape: (sd, sp) => [[0, sd * 3 * u], [-4 * u, sd * sp], [-14 * u, sd * sp * .8], [-8 * u, sd * 3 * u]],
        tail: () => { ell(-12 * u, 0, 10 * u, 5 * u, '#ff8787'); for (let i = 0; i < 3; i++) line((-18 + i * 5) * u, -4 * u, (-18 + i * 5) * u, 4 * u, 1 * u, '#c92a2a'); },
        body: (f) => { for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) line((-2 + i * 4) * u, sd * 3 * u, (-4 + i * 5 + f) * u, sd * 12 * u, 1 * u, '#212529'); },
        head: (hx) => line(hx + 4 * u, 0, hx + 16 * u, 0, 1.6 * u, '#212529') });
    },
    croco(e, u, w, o) {
      const s = Math.sin(w * 2.2);
      // rabo serpenteando
      c.strokeStyle = o.col; c.lineCap = 'round';
      for (let i = 0; i < 6; i++) { c.lineWidth = (10 - i * 1.5) * u; c.beginPath(); c.moveTo((-18 - i * 5) * u, Math.sin(o.t * 6 + e.id - i * .6) * i * 1.5 * u); c.lineTo((-23 - i * 5) * u, Math.sin(o.t * 6 + e.id - i * .6 - .6) * (i + 1) * 1.5 * u); c.stroke(); }
      for (const [lx, sd, ph] of [[10, -1, s], [10, 1, -s], [-10, -1, -s], [-10, 1, s]]) { line(lx * u, sd * 7 * u, (lx + ph * 6) * u, sd * 15 * u, 4 * u, shade(o.base, .75)); ell((lx + ph * 6) * u, sd * 15 * u, 3.5 * u, 2.5 * u, shade(o.base, .65)); }
      ell(0, 0, 21 * u, 10 * u, o.col);
      for (let i = -2; i <= 2; i++) { circ(i * 7 * u, -3 * u, 2 * u, shade(o.base, .7)); circ(i * 7 * u, 3 * u, 2 * u, shade(o.base, .7)); }
      const jaw = Math.max(0, Math.sin(o.t * 3 + e.id)) * .3;
      c.save(); c.translate(20 * u, 0);
      for (const sd of [-1, 1]) { c.save(); c.rotate(sd * jaw); poly([[0, sd * 1 * u], [0, sd * 7 * u], [18 * u, sd * 3 * u], [20 * u, sd * 1 * u]], o.col); for (let i = 0; i < 3; i++) poly([[(6 + i * 4) * u, sd * 1 * u], [(8 + i * 4) * u, sd * -1 * u], [(10 + i * 4) * u, sd * 1 * u]], '#fff'); c.restore(); }
      for (const sd of [-1, 1]) { circ(2 * u, sd * 6 * u, 4 * u, o.col); circ(3 * u, sd * 6 * u, 2.6 * u, '#ffe066'); line(3 * u, sd * 4.5 * u, 3 * u, sd * 7.5 * u, 1.2 * u, '#212529'); }
      c.restore();
      if (e.shield > 0) { c.globalAlpha = .28; ell(2 * u, 0, 28 * u, 16 * u, '#94d82d'); c.globalAlpha = 1; }
      helmet(-2 * u, 8 * u, o.tier);
    },
    xama(e, u, w, o) {
      biped(e, u, w, o, { skin: '#e9c46a', cloth: shade(o.base, .7), feet: '#5c3d2e', bodyRx: 10, bodyRy: 12, headR: 8.5, speed: 2, step: 7,
        body: (s, bx, by) => ell(-3 * u, 0, bx, by * 1.05, shade(o.base, .55)),
        hand: (x, y) => { line(x - 10 * u, y, x + 14 * u, y, 3 * u, '#7c4a1e'); c.globalAlpha = .5 + Math.sin(o.t * 5 + e.id) * .3; circ(x + 16 * u, y, 7 * u, '#8ce99a'); c.globalAlpha = 1; circ(x + 16 * u, y, 3.5 * u, '#2b8a3e'); },
        head: (hx, hr) => { circ(hx, 0, hr * 1.25, '#e63946'); circ(hx, 0, hr * .8, '#c92a2a'); circ(hx, 0, hr * .35, '#ffd43b'); poly([[hx - hr * .2, 0], [hx - hr * 2.2, -hr * .5], [hx - hr * 2.2, hr * .5]], '#ffd43b'); } });
    },
    bruxa(e, u, w, o) {
      const fl = Math.sin(o.t * 2 + e.id) * 2 * u;
      // vassoura por baixo (ela voa sentada)
      line(-26 * u, fl, 22 * u, fl, 3.5 * u, '#7c4a1e');
      for (let i = 0; i < 7; i++) line(-24 * u, fl, -36 * u, fl + (i - 3) * 2.5 * u + Math.sin(o.t * 10 + i) * u, 2 * u, '#e9c46a');
      biped(e, u, w, o, { skin: '#8ce99a', cloth: o.col, feet: '#343a40', bodyRx: 11, bodyRy: 15, headR: 10, speed: 0, step: 0, armLen: 12,
        hand: (x, y) => { circ(x + 8 * u, y, 5 * u, '#b197fc'); for (let i = 0; i < 3; i++) circ(x + 8 * u + Math.cos(o.t * 6 + i * 2) * 8 * u, y + Math.sin(o.t * 6 + i * 2) * 8 * u, 1.6 * u, '#e5dbff'); },
        head: (hx, hr) => { circ(hx, 0, hr * 1.7, '#343a40'); circ(hx, 0, hr * 1.05, '#495057'); circ(hx, 0, hr * .55, '#9775fa'); circ(hx - hr * .3, -hr * .2, hr * .25, '#212529'); poly([[hx + hr * .9, -2 * u], [hx + hr * 1.6, 0], [hx + hr * .9, 2 * u]], '#69db7c'); },
        angry: true });
    },
    // ================== GELO ==================
    pinguim(e, u, w, o) {
      const s = Math.sin(w * 3), wob = s * .15;
      c.save(); c.rotate(wob);
      ell(s * 5 * u, -6 * u, 5 * u, 3 * u, '#ff922b'); ell(-s * 5 * u, 6 * u, 5 * u, 3 * u, '#ff922b');
      for (const sd of [-1, 1]) { c.save(); c.translate(-2 * u, sd * 11 * u); c.rotate(sd * (.3 + s * sd * .4)); ell(-5 * u, 0, 8 * u, 3 * u, o.col); c.restore(); }
      ell(0, 0, 13 * u, 11 * u, o.col);
      ell(5 * u, 0, 7 * u, 8 * u, '#f8f9fa');
      line(-2 * u, -10 * u, -2 * u, 10 * u, 3 * u, '#e03131');
      circ(4 * u, 0, 8 * u, o.col);
      poly([[11 * u, -2 * u], [17 * u, 0], [11 * u, 2 * u]], '#ff922b');
      eyes(4 * u, 8 * u, u, false);
      helmet(3 * u, 7 * u, o.tier);
      c.restore();
    },
    yeti(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: o.col, feet: '#ced4da', bodyRx: 14, bodyRy: 18, headR: 11, speed: 1.7, step: 10, armW: 9, handR: 5.5, armLen: 15,
        body: (s, bx, by) => { for (let i = 0; i < 10; i++) { const a = i * .63; poly([[Math.cos(a) * bx * .9, Math.sin(a) * by * .9], [Math.cos(a + .2) * bx * 1.15, Math.sin(a + .2) * by * 1.15], [Math.cos(a + .35) * bx * .9, Math.sin(a + .35) * by * .9]], o.col); } },
        head: (hx, hr) => { ell(hx + hr * .45, 0, hr * .55, hr * .7, '#74c0fc'); c.fillStyle = '#1864ab'; c.beginPath(); c.ellipse(hx + hr * .7, 0, hr * .2, hr * .35, 0, 0, 7); c.fill(); },
        angry: true });
      if (e.shield > 0) { c.globalAlpha = .3; circ(0, 0, 28 * u, '#a5d8ff'); c.globalAlpha = 1; }
    },
    lobogelo(e, u, w, o) { DRAW.lobo(e, u, w, o); circ(-6 * u, -3 * u, 1.6 * u, '#fff'); circ(4 * u, 4 * u, 1.6 * u, '#fff'); },
    espirito(e, u, w, o) {
      // fantasma flutuando com rastro de névoa atrás
      for (let i = 1; i <= 4; i++) { c.globalAlpha = .45 - i * .09; ell(-i * 7 * u, Math.sin(o.t * 6 + i) * 3 * u, (14 - i * 2) * u, (12 - i * 2) * u, o.col); }
      c.globalAlpha = .9; ell(0, 0, 14 * u, 13 * u, o.col); c.globalAlpha = 1;
      ell(2 * u, 0, 9 * u, 8 * u, '#d0ebff');
      circ(7 * u, -4 * u, 2.6 * u, '#1864ab'); circ(7 * u, 4 * u, 2.6 * u, '#1864ab'); ell(11 * u, 0, 2 * u, 3 * u, '#1864ab');
      for (let i = 0; i < 3; i++) { const a = o.t * 3 + i * 2.1; circ(Math.cos(a) * 20 * u, Math.sin(a) * 20 * u, 1.8 * u, '#e7f5ff'); }
      helmet(-2 * u, 9 * u, o.tier);
    },
    golem(e, u, w, o) {
      const s = Math.sin(w * 1.2);
      for (const sd of [-1, 1]) { const fx = sd * s * 9 * u; poly([[fx - 5 * u, sd * 6 * u], [fx + 5 * u, sd * 6 * u], [fx + 5 * u, sd * 14 * u], [fx - 5 * u, sd * 14 * u]], shade(o.base, .65)); }
      for (const sd of [-1, 1]) { const ax = -sd * s * 12 * u; poly([[ax - 6 * u, sd * 22 * u], [ax + 8 * u, sd * 22 * u], [ax + 8 * u, sd * 34 * u], [ax - 6 * u, sd * 34 * u]], shade(o.base, .85)); line(0, sd * 18 * u, ax, sd * 26 * u, 8 * u, shade(o.base, .8)); }
      poly([[-14 * u, -22 * u], [14 * u, -22 * u], [16 * u, 22 * u], [-14 * u, 22 * u]], o.col);
      poly([[-8 * u, -14 * u], [6 * u, -8 * u], [-2 * u, 6 * u]], '#d0ebff'); poly([[0, 10 * u], [10 * u, 16 * u], [4 * u, 20 * u]], '#d0ebff');
      poly([[2 * u, -10 * u], [20 * u, -10 * u], [20 * u, 10 * u], [2 * u, 10 * u]], shade(o.base, .9));
      for (const sd of [-1, 1]) { poly([[6 * u, sd * 8 * u], [10 * u, sd * 16 * u], [12 * u, sd * 8 * u]], '#a5d8ff'); circ(17 * u, sd * 4 * u, 2.6 * u, '#e7f5ff'); }
      if (e.shield > 0) { c.globalAlpha = .28; circ(0, 0, 40 * u, '#d0ebff'); c.globalAlpha = 1; }
    },
    // ================== VULCÃO ==================
    diabrete(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: shade(o.base, .8), feet: shade(o.base, .55), bodyRx: 7, bodyRy: 9, headR: 8, speed: 3.2, step: 8, armLen: 9,
        back: (s) => { for (const sd of [-1, 1]) poly([[-2 * u, sd * 5 * u], [-12 * u, sd * (18 + Math.sin(o.t * 16) * 4) * u], [-4 * u, sd * 14 * u]], shade(o.base, .65));
          c.strokeStyle = o.col; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(-6 * u, 0); c.quadraticCurveTo(-16 * u, s * 8 * u, -22 * u, Math.sin(o.t * 6) * 6 * u); c.stroke(); poly([[-22 * u, Math.sin(o.t * 6) * 6 * u - 3 * u], [-27 * u, Math.sin(o.t * 6) * 6 * u], [-22 * u, Math.sin(o.t * 6) * 6 * u + 3 * u]], o.col); },
        head: (hx, hr) => { poly([[hx, -hr * .5], [hx - 4 * u, -hr * 1.6], [hx + 3 * u, -hr * .8]], '#ffe066'); poly([[hx, hr * .5], [hx - 4 * u, hr * 1.6], [hx + 3 * u, hr * .8]], '#ffe066'); },
        angry: true });
    },
    salamandra(e, u, w, o) {
      const s = Math.sin(w * 3);
      // corpo ondulando como lagartixa
      const seg = 6, pts = [];
      for (let i = 0; i <= seg; i++) pts.push([14 * u - i * 7 * u, Math.sin(w * 3 - i * .9) * (i * .9) * u]);
      for (const [lx, sd, ph] of [[8, -1, s], [8, 1, -s], [-8, -1, -s], [-8, 1, s]]) { line(lx * u, sd * 3 * u, (lx + ph * 6) * u, sd * 11 * u, 3 * u, shade(o.base, .8)); ell((lx + ph * 6) * u, sd * 11 * u, 2.6 * u, 2 * u, shade(o.base, .7)); }
      c.strokeStyle = o.col; c.lineCap = 'round';
      for (let i = 0; i < seg; i++) { c.lineWidth = (12 - i * 1.6) * u; c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); c.stroke(); }
      for (let i = 1; i < 4; i++) circ(pts[i][0], pts[i][1], 1.8 * u, '#ffe066');
      ell(20 * u, 0, 8 * u, 6.5 * u, o.col);
      eyes(18 * u, 6 * u, u, false);
      if (Math.sin(o.t * 6 + e.id) > .4) { c.globalAlpha = .7; circ(30 * u, 0, 3.5 * u, '#ffd43b'); c.globalAlpha = 1; }
      helmet(17 * u, 5 * u, o.tier);
    },
    magma(e, u, w, o) {
      biped(e, u, w, o, { skin: '#343a40', cloth: '#343a40', feet: '#212529', bodyRx: 13, bodyRy: 17, headR: 10, speed: 1.5, step: 9, armW: 8, handR: 5, armLen: 13,
        body: (s, bx, by) => { c.globalAlpha = .6 + Math.sin(o.t * 5 + e.id) * .4; line(-bx * .6, -by * .5, 0, 0, 2.5 * u, o.col); line(0, 0, bx * .5, -by * .3, 2.5 * u, '#ffa94d'); line(0, 0, -bx * .2, by * .6, 2.5 * u, o.col); line(-bx * .2, by * .6, bx * .4, by * .5, 2 * u, '#ffa94d'); c.globalAlpha = 1; },
        head: (hx, hr) => { c.globalAlpha = .7; line(hx - hr * .6, -hr * .4, hx + hr * .2, hr * .3, 2 * u, o.col); c.globalAlpha = 1; if (Math.random() < .3) circ(hx - hr + Math.random() * hr, (Math.random() - .5) * hr, 1.8 * u, '#ff922b'); } });
      // olhos de fogo por cima
      circ(8 * u, -4 * u, 2.4 * u, '#ffd43b'); circ(8 * u, 4 * u, 2.4 * u, '#ffd43b');
    },
    fenix(e, u, w, o) {
      flyer(e, u, o, { span: 32, wing: '#ff922b', wing2: '#ffd43b', bodyRx: 10, bodyRy: 7, headR: 6, headX: 11, flap: 9,
        tail: (f) => { for (let i = 0; i < 3; i++) poly([[-8 * u, (i - 1) * 3 * u], [(-24 - i * 3) * u, (i - 1) * 9 * u + f * 3 * u], [-10 * u, (i - 1) * 4 * u + 2 * u]], ['#ffd43b', '#ff922b', '#fa5252'][i]); },
        head: (hx, hr) => { poly([[hx + hr * .8, -2 * u], [hx + hr * 1.9, 0], [hx + hr * .8, 2 * u]], '#ffe066'); for (let i = 0; i < 3; i++) poly([[hx - hr * .3, (i - 1) * 2 * u], [hx - hr * 2, (i - 1) * 5 * u], [hx - hr * .6, (i - 1) * 2 * u + 2 * u]], '#fa5252'); } });
      if (Math.random() < .5) G_spark(-14 * u, (Math.random() - .5) * 14 * u, u);
      if (e.revived) { c.globalAlpha = .3; circ(0, 0, 26 * u, '#ffe066'); c.globalAlpha = 1; }
    },
    senhor(e, u, w, o) {
      biped(e, u, w, o, { skin: '#495057', cloth: '#212529', feet: '#343a40', bodyRx: 14, bodyRy: 19, headR: 12, speed: 1.5, step: 10, armW: 8, handR: 5, armLen: 14,
        body: () => { circ(2 * u, 0, 6 * u, o.col); circ(2 * u, 0, 3 * u, '#ffd43b'); },
        hand: (x, y) => { c.save(); c.translate(x, y); c.rotate(-.5 + Math.sin(o.t * 2.5 + e.id) * .6); line(-4 * u, 0, 36 * u, 0, 5 * u, '#ff922b'); line(-4 * u, 0, 32 * u, 0, 2 * u, '#fff3bf'); line(0, -6 * u, 0, 6 * u, 3 * u, '#ffd43b'); c.restore(); },
        head: (hx, hr) => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.sin(o.t * 9 + i) * .15, L = hr * (1.5 + (i % 2) * .4); poly([[hx + Math.cos(a - .3) * hr * .8, Math.sin(a - .3) * hr * .8], [hx + Math.cos(a) * L, Math.sin(a) * L], [hx + Math.cos(a + .3) * hr * .8, Math.sin(a + .3) * hr * .8]], i % 2 ? '#ffd43b' : '#ff922b'); } circ(hx, 0, hr, o.col);
          poly([[hx - hr * .2, -hr * .7], [hx - hr * 1.1, -hr * 1.4], [hx + hr * .2, -hr * .9]], '#212529'); poly([[hx - hr * .2, hr * .7], [hx - hr * 1.1, hr * 1.4], [hx + hr * .2, hr * .9]], '#212529'); },
        angry: true });
      if (e.shield > 0) { c.globalAlpha = .25; circ(0, 0, 40 * u, '#ff922b'); c.globalAlpha = 1; }
    },
    // ================== ILHA DOS PIRATAS ==================
    caranguejo(e, u, w, o) {
      bug(u, w, 4, 8, shade(o.base, .75), shade(o.base, .7));
      ell(0, 0, 13 * u, 16 * u, o.col);
      ell(-3 * u, -5 * u, 5 * u, 3 * u, 'rgba(255,255,255,.3)', -.3);
      const p = Math.abs(Math.sin(o.t * 6 + e.id)) * .6;
      for (const sd of [-1, 1]) { line(8 * u, sd * 10 * u, 16 * u, sd * 16 * u, 4 * u, o.col); c.save(); c.translate(19 * u, sd * 17 * u); ell(3 * u, 0, 7 * u, 5 * u, o.col); c.rotate(sd * p); ell(6 * u, sd * -3 * u, 6 * u, 2.4 * u, shade(o.base, .8)); c.restore(); }
      for (const sd of [-1, 1]) { line(10 * u, sd * 4 * u, 15 * u, sd * 5 * u, 1.5 * u, '#212529'); circ(15 * u, sd * 5 * u, 2.4 * u, '#fff'); circ(15.6 * u, sd * 5 * u, 1.2 * u, '#212529'); }
      if (e.shield > 0) { c.globalAlpha = .28; circ(0, 0, 22 * u, '#ffd8a8'); c.globalAlpha = 1; }
      helmet(-2 * u, 9 * u, o.tier);
    },
    pirata(e, u, w, o) {
      biped(e, u, w, o, { skin: '#f1f3f5', cloth: '#1971c2', feet: '#212529', bodyRx: 9, bodyRy: 12, headR: 9, speed: 2.4, step: 9,
        body: (s2, bx, by) => { for (let i = -2; i <= 2; i++) line(-bx * .8, i * 4 * u, bx * .8, i * 4 * u, 1.6 * u, '#fff'); },
        hand: (x, y) => { line(x, y, x + 12 * u, y, 4 * u, '#495057'); circ(x + 13 * u, y, 2.6 * u, '#212529'); },
        head: (hx, hr) => { c.fillStyle = '#212529'; c.beginPath(); c.arc(hx, 0, hr * 1.15, Math.PI * .6, Math.PI * 1.4); c.fill(); poly([[hx - hr * 1.6, -hr * .9], [hx + hr * .2, 0], [hx - hr * 1.6, hr * .9]], '#212529'); circ(hx - hr * .5, 0, hr * .3, '#f1f3f5'); circ(hx + hr * .5, -hr * .45, hr * .32, '#212529'); },
        angry: true });
    },
    gaivota(e, u, w, o) {
      flyer(e, u, o, { span: 30, wing: '#dee2e6', wing2: '#f8f9fa', bodyRx: 9, bodyRy: 6, headR: 5.5, headX: 10, flap: 12,
        wingShape: (sd, sp) => [[3 * u, sd * 3 * u], [-4 * u, sd * sp], [-10 * u, sd * sp * .9], [-6 * u, sd * 4 * u]],
        tail: () => poly([[-8 * u, -3 * u], [-15 * u, 0], [-8 * u, 3 * u]], '#adb5bd'),
        head: (hx, hr) => poly([[hx + hr * .8, -1.6 * u], [hx + hr * 2, 0], [hx + hr * .8, 1.6 * u]], '#ffa94d') });
      if (Math.random() < .05) circ(-6 * u, 0, 2 * u, '#ffd43b');
    },
    polvo(e, u, w, o) {
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * .6 + i * Math.PI * .8 / 7, wig = Math.sin(o.t * 6 + i + e.id) * .25;
        c.strokeStyle = o.col; c.lineCap = 'round'; c.lineWidth = 5 * u; c.beginPath(); c.moveTo(Math.cos(a) * 8 * u, Math.sin(a) * 8 * u);
        c.quadraticCurveTo(Math.cos(a + wig) * 18 * u, Math.sin(a + wig) * 18 * u, Math.cos(a - wig) * 26 * u, Math.sin(a - wig) * 26 * u); c.stroke();
      }
      ell(2 * u, 0, 15 * u, 14 * u, o.col);
      for (let i = 0; i < 4; i++) circ(-4 * u + i * 3 * u, (i % 2 ? 4 : -4) * u, 1.6 * u, shade(o.base, .8));
      eyes(4 * u, 12 * u, u, true);
      helmet(-2 * u, 10 * u, o.tier);
    },
    kraken(e, u, w, o) {
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI * 2 / 10, wig = Math.sin(o.t * 4 + i) * .3;
        c.strokeStyle = shade(o.base, .85); c.lineCap = 'round'; c.lineWidth = 8 * u; c.beginPath(); c.moveTo(Math.cos(a) * 14 * u, Math.sin(a) * 14 * u);
        c.quadraticCurveTo(Math.cos(a + wig) * 30 * u, Math.sin(a + wig) * 30 * u, Math.cos(a - wig) * 42 * u, Math.sin(a - wig) * 42 * u); c.stroke();
        for (let j = 1; j < 3; j++) circ(Math.cos(a) * (18 + j * 7) * u, Math.sin(a) * (18 + j * 7) * u, 1.8 * u, '#fcc2d7');
      }
      ell(0, 0, 22 * u, 20 * u, o.col);
      ell(-6 * u, -6 * u, 7 * u, 4 * u, 'rgba(255,255,255,.2)');
      eyes(6 * u, 18 * u, u, true, '#f59f00');
      if (e.shield > 0) { c.globalAlpha = .25; circ(0, 0, 44 * u, '#4dabf7'); c.globalAlpha = 1; }
    },
    // ================== CEMITÉRIO ==================
    zumbi(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: '#5c7cfa', feet: '#495057', bodyRx: 9, bodyRy: 12, headR: 9.5, speed: 1.4, step: 7, arms: 'forward', armLen: 14,
        body: (s2, bx, by) => { poly([[-bx, by * .3], [-bx * .3, by * .8], [-bx * .6, by * .2]], '#364fc7'); },
        head: (hx, hr) => { circ(hx - hr * .3, -hr * .4, hr * .25, '#2b8a3e'); line(hx + hr * .3, hr * .1, hx + hr * .8, hr * .4, 1.4 * u, '#c92a2a'); } });
      if (e.revived) { c.globalAlpha = .4; circ(0, 0, 18 * u, '#69db7c'); c.globalAlpha = 1; }
    },
    esqueleto(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: 'rgba(0,0,0,0)', feet: '#dee2e6', bodyRx: 7, bodyRy: 11, headR: 9, speed: 3, step: 10, armW: 3,
        body: (s2, bx, by) => { line(-bx, 0, bx, 0, 3 * u, o.col); for (let i = -2; i <= 2; i++) line(-bx * .2, i * 3.5 * u, bx * .6, i * 3.5 * u, 2 * u, o.col); },
        hand: (x, y) => { line(x, y, x + 8 * u, y - 3 * u, 3 * u, o.col); circ(x + 8 * u, y - 3 * u, 2.2 * u, o.col); },
        head: (hx, hr) => { circ(hx + hr * .5, -hr * .4, hr * .3, '#212529'); circ(hx + hr * .5, hr * .4, hr * .3, '#212529'); } });
      if (o.dash) for (let i = 0; i < 3; i++) line(-24 * u - i * 5 * u, (i - 1) * 6 * u, -34 * u - i * 5 * u, (i - 1) * 6 * u, 2 * u, 'rgba(255,255,255,.6)');
    },
    fantasma(e, u, w, o) { DRAW.espirito(e, u, w, Object.assign({}, o)); },
    vampiro(e, u, w, o) {
      flyer(e, u, o, { span: 28, wing: '#5c0f0f', wing2: shade(o.base, .8), bodyRx: 8, bodyRy: 7, headR: 7, headX: 7, flap: 16, eyeCol: '#ffe066',
        wingShape: (sd, sp) => [[3 * u, sd * 4 * u], [6 * u, sd * sp], [-2 * u, sd * sp * .75], [-6 * u, sd * sp], [-8 * u, sd * sp * .5], [-6 * u, sd * 4 * u]],
        head: (hx, hr) => { poly([[hx - 2 * u, -hr * .6], [hx - 4 * u, -hr * 1.7], [hx + 2 * u, -hr * .8]], o.col); poly([[hx - 2 * u, hr * .6], [hx - 4 * u, hr * 1.7], [hx + 2 * u, hr * .8]], o.col); poly([[hx + hr * .8, -1.5 * u], [hx + hr * 1.3, -.5 * u], [hx + hr * .8, 0]], '#fff'); poly([[hx + hr * .8, 1.5 * u], [hx + hr * 1.3, .5 * u], [hx + hr * .8, 0]], '#fff'); } });
    },
    conde(e, u, w, o) {
      // capa esvoaçante por trás
      const fl = Math.sin(o.t * 4 + e.id);
      poly([[-2 * u, -20 * u], [-28 * u, -24 * u + fl * 3 * u], [-34 * u, 0], [-28 * u, 24 * u - fl * 3 * u], [-2 * u, 20 * u]], '#212529');
      poly([[-4 * u, -16 * u], [-24 * u, -18 * u], [-28 * u, 0], [-24 * u, 18 * u], [-4 * u, 16 * u]], '#c92a2a');
      biped(e, u, w, o, { skin: '#f1f3f5', cloth: o.col, feet: '#212529', bodyRx: 12, bodyRy: 16, headR: 11, speed: 1.4, step: 8, armLen: 13,
        hand: (x, y) => { for (let i = 0; i < 3; i++) circ(x + 6 * u + Math.cos(o.t * 5 + i * 2) * 7 * u, y + Math.sin(o.t * 5 + i * 2) * 7 * u, 2 * u, '#c92a2a'); },
        head: (hx, hr) => { c.fillStyle = '#212529'; c.beginPath(); c.arc(hx, 0, hr * 1.05, Math.PI * .55, Math.PI * 1.45); c.fill(); poly([[hx - hr * .2, -hr * .2], [hx + hr * .4, 0], [hx - hr * .2, hr * .2]], '#212529'); },
        angry: true });
    },
    // ================== CAVERNAS DE CRISTAL ==================
    aranha(e, u, w, o) {
      const s2 = Math.sin(w * 5);
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
        const ph = (i % 2 ? s2 : -s2) * 4 * u, lx = (6 - i * 5) * u;
        const k1 = [lx + ph, sd * 14 * u], k2 = [lx + ph * 1.5 + (i < 2 ? 6 : -6) * u, sd * 22 * u];
        line(lx * .5, sd * 4 * u, k1[0], k1[1], 2.6 * u, shade(o.base, .7)); line(k1[0], k1[1], k2[0], k2[1], 2 * u, shade(o.base, .6));
      }
      ell(-8 * u, 0, 11 * u, 9 * u, o.col);
      poly([[-14 * u, 0], [-8 * u, -5 * u], [-2 * u, 0], [-8 * u, 5 * u]], '#e5dbff');
      ell(5 * u, 0, 7 * u, 6 * u, shade(o.base, .85));
      for (let i = 0; i < 4; i++) circ(9 * u, (i - 1.5) * 2.4 * u, 1.3 * u, '#ff6b6b');
      helmet(4 * u, 5 * u, o.tier);
    },
    toupeira(e, u, w, o) {
      const s2 = Math.sin(w * 3);
      for (const [lx, sd, ph] of [[8, -1, s2], [8, 1, -s2], [-8, -1, -s2], [-8, 1, s2]]) { ell((lx + ph * 4) * u, sd * 12 * u, 4 * u, 3 * u, '#ffc9c9'); }
      ell(0, 0, 16 * u, 12 * u, o.col);
      ell(14 * u, 0, 7 * u, 6 * u, shade(o.base, .9));
      circ(20 * u, 0, 3 * u, '#ff8787');
      circ(13 * u, -3 * u, 1.3 * u, '#212529'); circ(13 * u, 3 * u, 1.3 * u, '#212529');
      for (let i = 0; i < 3; i++) line(19 * u, (i - 1) * 1.5 * u, 24 * u, (i - 1) * 4 * u, .8 * u, '#212529');
      helmet(6 * u, 8 * u, o.tier);
    },
    morcegocristal(e, u, w, o) {
      flyer(e, u, o, { span: 26, wing: '#3bc9db', wing2: '#99e9f2', bodyRx: 8, bodyRy: 7, headR: 6.5, headX: 7, flap: 18, eyeCol: '#7048e8',
        wingShape: (sd, sp) => [[3 * u, sd * 4 * u], [4 * u, sd * sp], [-3 * u, sd * sp * .7], [-8 * u, sd * sp * .95], [-7 * u, sd * 4 * u]],
        body: () => poly([[-6 * u, 0], [0, -4 * u], [5 * u, 0], [0, 4 * u]], '#e3fafc') });
    },
    golemcristal(e, u, w, o) {
      const s2 = Math.sin(w * 1.2);
      for (const sd of [-1, 1]) { const fx = sd * s2 * 8 * u; poly([[fx - 5 * u, sd * 6 * u], [fx + 5 * u, sd * 6 * u], [fx + 3 * u, sd * 14 * u], [fx - 4 * u, sd * 14 * u]], shade(o.base, .6)); }
      for (const sd of [-1, 1]) { const ax = -sd * s2 * 10 * u; poly([[ax - 4 * u, sd * 20 * u], [ax + 8 * u, sd * 22 * u], [ax + 4 * u, sd * 32 * u], [ax - 6 * u, sd * 30 * u]], shade(o.base, .85)); }
      poly([[-16 * u, 0], [-6 * u, -20 * u], [10 * u, -18 * u], [16 * u, 0], [10 * u, 18 * u], [-6 * u, 20 * u]], o.col);
      poly([[-6 * u, -20 * u], [2 * u, -4 * u], [10 * u, -18 * u]], shade(o.base, 1.2)); poly([[-6 * u, 20 * u], [2 * u, 4 * u], [10 * u, 18 * u]], shade(o.base, .8));
      poly([[6 * u, -8 * u], [18 * u, 0], [6 * u, 8 * u]], shade(o.base, 1.1));
      circ(12 * u, -3 * u, 2 * u, '#fff'); circ(12 * u, 3 * u, 2 * u, '#fff');
      if (e.shield > 0) { c.globalAlpha = .28; circ(0, 0, 30 * u, '#e599f7'); c.globalAlpha = 1; }
    },
    rainha(e, u, w, o) {
      DRAW.aranha(e, u * 1.7, w * .7, o);
      for (let i = 0; i < 5; i++) poly([[(4 + (i - 2) * 1.5) * 1.7 * u, -6 * u + i * 3 * u], [(1 + (i - 2) * 1.5) * 1.7 * u, -8 * u + i * 3 * u], [(7 + (i - 2) * 1.5) * 1.7 * u, -8 * u + i * 3 * u]], '#ffd43b');
      if (e.shield > 0) { c.globalAlpha = .22; circ(0, 0, 44 * u, '#b197fc'); c.globalAlpha = 1; }
    },
    // ================== REINO DAS NUVENS ==================
    harpia(e, u, w, o) {
      flyer(e, u, o, { span: 34, wing: shade(o.base, .7), wing2: '#ffc078', bodyRx: 9, bodyRy: 8, headR: 7, headX: 10, flap: 10, headCol: '#ffd8a8',
        tail: () => { for (let i = -1; i <= 1; i++) poly([[-8 * u, i * 2 * u], [-18 * u, i * 6 * u], [-10 * u, i * 2 * u + 2 * u]], o.col); },
        head: (hx, hr) => { c.fillStyle = '#5c3a14'; c.beginPath(); c.arc(hx, 0, hr * 1.1, Math.PI * .5, Math.PI * 1.5); c.fill(); }, angry: true });
    },
    duende(e, u, w, o) {
      biped(e, u, w, o, { skin: '#ffe8cc', cloth: o.col, feet: '#2b8a3e', bodyRx: 7, bodyRy: 9, headR: 8, speed: 3.4, step: 9, armLen: 9,
        back: () => { c.globalAlpha = .6; for (const sd of [-1, 1]) ell(-6 * u, sd * 10 * u, 8 * u, 4 * u, '#e3fafc', sd * (.5 + Math.sin(o.t * 30) * .3)); c.globalAlpha = 1; },
        head: (hx, hr) => { circ(hx - hr * .2, 0, hr * .9, o.col); poly([[hx - hr * .2, -hr * .3], [hx - hr * 2.2, 0], [hx - hr * .2, hr * .3]], shade(o.base, .8)); } });
      for (let i = 0; i < 3; i++) circ(-14 * u - i * 6 * u, Math.sin(o.t * 8 + i) * 4 * u, 1.4 * u, '#fff');
    },
    nuvem(e, u, w, o) {
      const b = Math.sin(o.t * 3 + e.id) * 1.5 * u;
      for (const [x, y, r] of [[-10, 0, 11], [0, -6, 12], [10, 0, 11], [0, 7, 11], [-4, 2, 12]]) circ(x * u, y * u + b, r * u, o.col);
      for (const [x, y, r] of [[-8, -2, 7], [2, -6, 8]]) circ(x * u, y * u + b, r * u, '#e9ecef');
      eyes(6 * u, 10 * u, u, true);
      if (Math.sin(o.t * 5 + e.id) > .7) { c.strokeStyle = '#ffe066'; c.lineWidth = 2.5 * u; c.beginPath(); c.moveTo(0, 10 * u); c.lineTo(-4 * u, 18 * u); c.lineTo(2 * u, 18 * u); c.lineTo(-3 * u, 28 * u); c.stroke(); }
      helmet(-2 * u, 10 * u, o.tier);
    },
    grifo(e, u, w, o) {
      flyer(e, u, o, { span: 36, wing: '#f8f0e3', wing2: '#fff3bf', bodyRx: 14, bodyRy: 9, headR: 7, headX: 15, flap: 8, headCol: '#f8f9fa',
        tail: () => { line(-14 * u, 0, -26 * u, Math.sin(o.t * 5) * 4 * u, 3 * u, o.col); circ(-27 * u, Math.sin(o.t * 5) * 4 * u, 3 * u, shade(o.base, .7)); },
        body: () => { for (const [lx, sd] of [[8, -1], [8, 1], [-8, -1], [-8, 1]]) ell(lx * u, sd * 10 * u, 3 * u, 3 * u, shade(o.base, .7)); },
        head: (hx, hr) => poly([[hx + hr * .7, -2.5 * u], [hx + hr * 1.9, 0], [hx + hr * .7, 2.5 * u]], '#ffa94d') });
      if (e.shield > 0) { c.globalAlpha = .25; circ(0, 0, 26 * u, '#fff3bf'); c.globalAlpha = 1; }
    },
    tempestade(e, u, w, o) {
      for (let i = 0; i < 3; i++) { c.globalAlpha = .5; circ(Math.cos(o.t * 2 + i * 2.1) * 26 * u, Math.sin(o.t * 2 + i * 2.1) * 26 * u, 8 * u, '#adb5bd'); c.globalAlpha = 1; }
      biped(e, u, w, o, { skin: '#a5d8ff', cloth: o.col, feet: '#1864ab', bodyRx: 13, bodyRy: 17, headR: 11, speed: 0, step: 0, armLen: 13, armW: 7,
        hand: (x, y) => { c.strokeStyle = '#ffe066'; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 * u, y - 4 * u); c.lineTo(x + 6 * u, y + 2 * u); c.lineTo(x + 16 * u, y - 2 * u); c.stroke(); },
        head: (hx, hr) => { for (let i = 0; i < 5; i++) { const a = Math.PI * .6 + i * Math.PI * .2; circ(hx + Math.cos(a) * hr, Math.sin(a) * hr, hr * .45, '#f1f3f5'); } poly([[hx - hr * .6, -hr * .6], [hx + hr * .3, -hr * 1.3], [hx + hr * .2, -hr * .4]], '#ffd43b'); },
        angry: true });
    },
    // ================== ABISMO SOMBRIO ==================
    cavaleiro(e, u, w, o) {
      biped(e, u, w, o, { skin: '#868e96', cloth: o.col, feet: '#343a40', bodyRx: 12, bodyRy: 16, headR: 10, speed: 1.6, step: 9, armW: 7, armLen: 12,
        body: (s2, bx, by) => { line(-bx * .6, 0, bx * .6, 0, 2 * u, '#adb5bd'); line(0, -by * .6, 0, by * .6, 2 * u, '#adb5bd'); },
        hand: (x, y) => { line(x, y, x + 24 * u, y, 3.5 * u, '#dee2e6'); line(x + 2 * u, y - 5 * u, x + 2 * u, y + 5 * u, 3 * u, '#ffd43b'); },
        head: (hx, hr) => { circ(hx, 0, hr, '#495057'); line(hx + hr * .4, -hr * .6, hx + hr * .4, hr * .6, 2 * u, '#fa5252'); poly([[hx - hr * .9, 0], [hx - hr * 2, -hr * .5], [hx - hr * 1.6, 0], [hx - hr * 2, hr * .5]], '#c92a2a'); } });
      // escudo do lado esquerdo
      if (e.shield > 0) { ell(4 * u, -20 * u, 9 * u, 6 * u, '#343a40'); ell(4 * u, -20 * u, 6 * u, 3.5 * u, '#c92a2a'); }
    },
    demonio(e, u, w, o) {
      biped(e, u, w, o, { skin: o.col, cloth: '#5c0f0f', feet: '#212529', bodyRx: 10, bodyRy: 13, headR: 9.5, speed: 2.6, step: 9,
        back: (s2) => { for (const sd of [-1, 1]) poly([[-2 * u, sd * 7 * u], [-16 * u, sd * (24 + Math.sin(o.t * 10) * 4) * u], [-10 * u, sd * 10 * u], [-14 * u, sd * 16 * u], [-4 * u, sd * 12 * u]], '#5c0f0f'); },
        hand: (x, y) => { c.globalAlpha = .8; circ(x + 4 * u, y, 5 * u, '#ff922b'); circ(x + 4 * u, y, 2.5 * u, '#ffe066'); c.globalAlpha = 1; },
        head: (hx, hr) => { poly([[hx - hr * .2, -hr * .6], [hx - hr * 1.3, -hr * 1.5], [hx + hr * .1, -hr * .9]], '#f8f9fa'); poly([[hx - hr * .2, hr * .6], [hx - hr * 1.3, hr * 1.5], [hx + hr * .1, hr * .9]], '#f8f9fa'); },
        angry: true });
    },
    sombra(e, u, w, o) {
      for (let i = 1; i <= 4; i++) { c.globalAlpha = .35 - i * .07; ell(-i * 6 * u, Math.sin(o.t * 5 + i) * 3 * u, (14 - i * 2) * u, (12 - i * 2) * u, '#212529'); }
      c.globalAlpha = .9; ell(0, 0, 14 * u, 13 * u, o.col); c.globalAlpha = 1;
      circ(8 * u, -4 * u, 2.6 * u, '#ff6b6b'); circ(8 * u, 4 * u, 2.6 * u, '#ff6b6b');
      for (let i = 0; i < 5; i++) { const a = Math.PI * .6 + i * .45; line(Math.cos(a) * 12 * u, Math.sin(a) * 12 * u, Math.cos(a) * (18 + Math.sin(o.t * 8 + i) * 3) * u, Math.sin(a) * (18 + Math.sin(o.t * 8 + i) * 3) * u, 3 * u, o.col); }
      if (o.dash) for (let i = 0; i < 3; i++) line(-26 * u - i * 5 * u, (i - 1) * 6 * u, -36 * u - i * 5 * u, (i - 1) * 6 * u, 2 * u, 'rgba(120,80,160,.6)');
    },
    dragaonegro(e, u, w, o) {
      flyer(e, u, o, { span: 38, wing: '#343a40', wing2: '#7048e8', bodyRx: 14, bodyRy: 8, headR: 7, headX: 16, flap: 7, eyeCol: '#ff6b6b',
        wingShape: (sd, sp) => [[6 * u, sd * 4 * u], [2 * u, sd * sp], [-6 * u, sd * sp * .7], [-10 * u, sd * sp * .9], [-12 * u, sd * sp * .5], [-8 * u, sd * 5 * u]],
        tail: () => { c.strokeStyle = o.col; c.lineWidth = 5 * u; c.lineCap = 'round'; c.beginPath(); c.moveTo(-12 * u, 0); c.quadraticCurveTo(-22 * u, Math.sin(o.t * 5) * 8 * u, -30 * u, -Math.sin(o.t * 5) * 4 * u); c.stroke(); poly([[-30 * u, -4 * u], [-36 * u, 0], [-30 * u, 4 * u]], '#7048e8'); },
        body: () => { for (let i = 0; i < 4; i++) poly([[(-8 + i * 5) * u, -2 * u], [(-6 + i * 5) * u, -6 * u], [(-4 + i * 5) * u, -2 * u]], '#7048e8'); },
        head: (hx, hr) => { ell(hx + hr, 0, hr * .8, hr * .5, o.col); poly([[hx - hr * .3, -hr * .5], [hx - hr * 1.6, -hr * 1.1], [hx, -hr * .8]], '#868e96'); poly([[hx - hr * .3, hr * .5], [hx - hr * 1.6, hr * 1.1], [hx, hr * .8]], '#868e96'); if (Math.sin(o.t * 6 + e.id) > .5) { c.globalAlpha = .8; circ(hx + hr * 2.2, 0, hr * .7, '#9775fa'); c.globalAlpha = 1; } } });
      if (e.revived) { c.globalAlpha = .3; circ(0, 0, 26 * u, '#9775fa'); c.globalAlpha = 1; }
    },
    trevas(e, u, w, o) {
      c.globalAlpha = .35 + Math.sin(o.t * 2) * .1; circ(0, 0, 44 * u, '#7048e8'); c.globalAlpha = 1;
      biped(e, u, w, o, { skin: '#495057', cloth: '#212529', feet: '#000', bodyRx: 15, bodyRy: 21, headR: 12, speed: 1.2, step: 9, armW: 8, armLen: 15,
        back: () => { poly([[-2 * u, -22 * u], [-30 * u, -30 * u], [-38 * u, 0], [-30 * u, 30 * u], [-2 * u, 22 * u]], '#343a40'); },
        body: () => { circ(2 * u, 0, 6 * u, '#9775fa'); circ(2 * u, 0, 3 * u, '#fff'); },
        hand: (x, y) => { line(x - 10 * u, y, x + 30 * u, y, 3 * u, '#495057'); c.save(); c.translate(x + 30 * u, y); c.rotate(o.t * 3); for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); poly([[0, 0], [10 * u, -3 * u], [10 * u, 3 * u]], '#9775fa'); } c.restore(); },
        head: (hx, hr) => { for (let i = 0; i < 6; i++) { const a = Math.PI * .5 + i * Math.PI / 5; poly([[hx + Math.cos(a) * hr * .8, Math.sin(a) * hr * .8], [hx + Math.cos(a) * hr * 1.7, Math.sin(a) * hr * 1.7], [hx + Math.cos(a + .2) * hr * .8, Math.sin(a + .2) * hr * .8]], '#868e96'); } circ(hx, 0, hr, '#212529'); },
        angry: true });
      circ(13 * u, -4 * u, 2.6 * u, '#ff6b6b'); circ(13 * u, 4 * u, 2.6 * u, '#ff6b6b');
      if (e.shield > 0) { c.globalAlpha = .22; circ(0, 0, 46 * u, '#b197fc'); c.globalAlpha = 1; }
    },
    larva(e, u, w, o) {                                   // larva de lava: corpo em anéis brilhando
      const n = 7;
      for (let i = n - 1; i >= 0; i--) {
        const x = 12 * u - i * 6 * u, y = Math.sin(w * 3 - i * .8) * 3 * u, r2 = (11 - Math.abs(i - 2) * 1.1) * u;
        circ(x, y, r2, i % 2 ? shade(o.base, .6) : o.col);
        c.globalAlpha = .5 + Math.sin(o.t * 6 + i) * .3; circ(x, y, r2 * .45, '#ffd43b'); c.globalAlpha = 1;
      }
      for (let i = 0; i < 6; i++) { const a2 = -0.9 + i * .36; line(16 * u, 0, 16 * u + Math.cos(a2) * 9 * u, Math.sin(a2) * 9 * u, 1.6 * u, '#212529'); }
      eyes(14 * u, 9 * u, u, true, '#ffd43b');
      if (Math.random() < .2) circ(-26 * u + Math.random() * 6 * u, (Math.random() - .5) * 10 * u, 1.6 * u, '#ff922b');
      helmet(10 * u, 7 * u, o.tier);
    },
    larvinha(e, u, w, o) { DRAW.larva(e, u * .6, w * 1.4, o); },
    // ================== FASE SECRETA ==================
    ladrao(e, u, w, o) {
      biped(e, u, w, o, { skin: '#69db7c', cloth: '#343a40', feet: '#212529', bodyRx: 8, bodyRy: 10, headR: 8.5, speed: 3.4, step: 10,
        back: () => { ell(-11 * u, 0, 10 * u, 11 * u, '#c08a3e'); line(-11 * u, -6 * u, -11 * u, 6 * u, 2 * u, '#7c4a1e'); c.fillStyle = '#ffd43b'; c.font = 'bold ' + 11 * u + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', -12 * u, 1 * u); },
        head: (hx, hr) => { poly([[hx - 2 * u, -hr * .7], [hx - 9 * u, -hr * 1.8], [hx + 2 * u, -hr * .9]], '#69db7c'); poly([[hx - 2 * u, hr * .7], [hx - 9 * u, hr * 1.8], [hx + 2 * u, hr * .9]], '#69db7c'); line(hx + hr * .55, -hr * .9, hx + hr * .55, hr * .9, 4 * u, '#212529'); } });
      if (Math.random() < .12) circ(-14 * u + (Math.random() - .5) * 8 * u, (Math.random() - .5) * 10 * u, 1.6 * u, '#ffd43b');
    },
  };
  function G_spark(x, y, u) { circ(x, y, 1.6 * u, '#ffd43b'); }

  window.Monsters = {
    draw(ctx, e, x, y, r, o) {
      c = ctx;
      const D = Sim.ENEMIES[e.type], u = r / 22;
      const base = D.color;
      const col = o.hitT > 0 ? '#ffffff' : e.slowT > 0 ? '#a5d8ff' : shade(base, .72);   // cores mais escuras/sombrias
      if (e.under && (e.type === 'fantasma' || e.type === 'sombra')) {   // INVISÍVEL: só um vulto
        c.save(); c.globalAlpha = .18; c.translate(x, y); c.rotate(o.angle || 0); DRAW[e.type](e, r / 22, o.walk, Object.assign({ base: D.color, col: D.color }, o)); c.restore(); c.globalAlpha = 1;
        return;
      }
      if (e.under) {                                      // embaixo da terra/lava: montinho andando
        const mc = e.type === 'salamandra' ? '#c92a2a' : '#a07040';
        ell(x, y, r * .7, r * .5, mc);
        for (let i = 0; i < 3; i++) circ(x + (i - 1) * r * .35, y + Math.sin(o.t * 12 + i) * 2, r * .12, shade(mc, .8));
        return;
      }
      const fly = D.fly || e.type === 'bruxa';
      if (!DRAW[e.type]) return;
      // sombra (voadores: sombra deslocada no chão, mais longe)
      c.fillStyle = 'rgba(0,0,0,' + (fly ? .14 : .16) + ')';
      c.beginPath(); c.ellipse(x + (fly ? r * .45 : r * .1), y + (fly ? r * .8 : r * .14), r * (fly ? .45 : .6), r * (fly ? .3 : .45), 0, 0, 7); c.fill();
      c.save();
      c.translate(x, y - (fly ? r * .25 + Math.sin(o.t * 3 + e.id) * r * .08 : 0));
      c.rotate(o.angle || 0);                              // gira o corpo para a direção do caminho
      if (o.atk) { const a = Math.sin(o.atk * Math.PI); c.translate(a * r * .25, 0); c.scale(1 + a * .18, 1 + a * .18); }   // investida ao atacar
      // Efeito leve para não sobrecarregar o canvas quando há muitos inimigos.
      // Monstros comuns usam apenas um contorno; o brilho pulsante fica reservado aos chefes.
      if (D.boss) {
        const pulse = .5 + .5 * Math.sin(o.t * 4.5 + e.id);
        c.globalAlpha = .42 + pulse * .2;
        c.strokeStyle = D.color;
        c.lineWidth = Math.max(2, r * .055);
        c.beginPath();
        c.ellipse(0, 0, r * 1.28, r * 1.14, 0, 0, 7);
        c.stroke();
        c.globalAlpha = .2 + pulse * .1;
        c.lineWidth = Math.max(1, r * .035);
        c.beginPath();
        c.arc(0, 0, r * 1.42, -Math.PI, Math.PI);
        c.stroke();
      } else {
        c.globalAlpha = .42;
        c.strokeStyle = D.color;
        c.lineWidth = Math.max(1, r * .025);
        c.beginPath();
        c.ellipse(0, 0, r * 1.04, r * .94, 0, 0, 7);
        c.stroke();
      }
      c.globalAlpha = 1;
      if (e.revived && !D.fly) {
        c.globalAlpha = .25 + Math.sin(o.t * 6) * .1;
        circ(0, 0, r * 1.15, '#fff3bf');
        c.globalAlpha = 1;
      }
      DRAW[e.type](e, u, o.walk, Object.assign({ base, col }, o));
      c.restore();
      if (e.slowT > 0) { c.globalAlpha = .75; c.fillStyle = '#e7f5ff'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + Math.cos(o.t * 3 + i * 2) * r * .8, y + Math.sin(o.t * 3 + i * 2) * r * .8, r * .08, 0, 7); c.fill(); } c.globalAlpha = 1; }
      if (o.atk > .3) { c.fillStyle = '#000'; c.font = 'bold ' + (r * .55) + 'px sans-serif'; c.textAlign = 'center'; c.fillText('💢', x + r * .7, y - r * .9); }
      // barras de vida e escudo
      const top = y - r * (D.boss ? 1.45 : 1.2) - (fly ? r * .3 : 0);
      if (e.hp < e.maxHp || e.maxShield) {
        c.fillStyle = '#000a'; c.fillRect(x - r * .8, top, r * 1.6, 5);
        c.fillStyle = e.hp / e.maxHp > .4 ? '#51cf66' : '#ff6b6b'; c.fillRect(x - r * .8, top, r * 1.6 * Math.max(0, e.hp / e.maxHp), 5);
        if (e.shield > 0) { c.fillStyle = '#4dabf7'; c.fillRect(x - r * .8, top - 4, r * 1.6 * e.shield / e.maxShield, 3); }
      }
    },
  };
})();
