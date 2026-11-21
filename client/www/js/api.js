/* Comunicação com o servidor. Em modo demonstração usa um "servidor de mentira" local. */
(function () {
  'use strict';
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  function uuid() {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }
  function deviceId() {
    let d = LS.get('rg_device');
    if (!d) { d = uuid(); LS.set('rg_device', d); }
    return d;
  }

  // ---------- Servidor real ----------
  function Remote(base) {
    let token = LS.get('rg_token');
    async function call(path, body, retry) {
      let r;
      try {
        r = await fetch(base + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) { return { error: 'Sem conexão com o servidor' }; }
      if (r.status === 401 && !retry) { await login(); return call(path, body, true); }
      try { return await r.json(); } catch (e) { return { error: 'Erro no servidor' }; }
    }
    async function login() {
      token = null;
      const out = await call('/api/auth/guest', { deviceId: deviceId() }, true);
      if (out.token) { token = out.token; LS.set('rg_token', token); API.playerId = out.playerId; LS.set('rg_pid', out.playerId); }
      return out;
    }
    const saveSession = (o) => { if (o && o.token) { token = o.token; LS.set('rg_token', token); API.playerId = o.playerId; LS.set('rg_pid', o.playerId); } return o; };
    return {
      demo: false,
      async init() { if (!token) return login(); API.playerId = LS.get('rg_pid'); const me = await call('/api/me'); return me.error ? login() : me; },
      start: (level, bonus, loadout) => call('/api/level/start', { level, bonus: !!bonus, loadout: Array.isArray(loadout) ? loadout : undefined }),
      finish: (runId, actions) => call('/api/level/finish', { runId, actions }),
      multiRooms: () => call('/api/multi/rooms'),
      multiCreate: () => call('/api/multi/create', {}),
      multiJoin: (code) => call('/api/multi/join', { code }),
      multiState: (code) => call('/api/multi/state?code=' + encodeURIComponent(code)),
      multiStart: (code, level) => call('/api/multi/start', { code, level }),
      multiAction: (code, action) => call('/api/multi/action', { code, action }),
      multiSync: (code, cursor, snapshot, actionStart, actions) => call('/api/multi/sync', { code, cursor, snapshot, actionStart, actions }),
      multiFinish: (code) => call('/api/multi/finish', { code }),
      multiLeave: (code) => call('/api/multi/leave', { code }),
      upgrade: (tower) => call('/api/upgrade', { tower }),
      buy: (item) => call('/api/shop/buy', { item }),
      daily: () => call('/api/daily/claim', {}),
      chest: (type, pay) => call('/api/chest/open', { type, pay }),
      offer: (i) => call('/api/offer/buy', { i }),
      verifyPurchase: (productId, purchaseToken) => call('/api/iap/verify', { productId, purchaseToken }),
      // ----- conta -----
      account: () => call('/api/account'),
      leaderboard: () => call('/api/leaderboard'),
      emailStart: (email, password) => call('/api/auth/email/start', { email, password }),
      emailVerify: (challengeId, code) => call('/api/auth/email/verify', { challengeId, code, deviceId: deviceId() }).then(saveSession),
      emailLogin: (email, password) => call('/api/auth/email/login', { email, password, deviceId: deviceId() }).then(saveSession),
      recoveryStart: (channel, target) => call('/api/auth/recovery/start', channel === 'sms' ? { channel, phone: target } : { channel, email: target }),
      recoveryVerify: (challengeId, code, password) => call('/api/auth/recovery/verify', { challengeId, code, password, deviceId: deviceId() }).then(saveSession),
      phoneStart: (phone) => call('/api/account/phone/start', { phone }),
      phoneVerify: (challengeId, code) => call('/api/account/phone/verify', { challengeId, code }),
      newCode: () => call('/api/account/code', {}),
      async recover(code) { const o = await call('/api/auth/recover', { code, deviceId: deviceId() }, true); if (o.token) { token = o.token; LS.set('rg_token', token); API.playerId = o.playerId; LS.set('rg_pid', o.playerId); } return o; },
      async google(idToken) { const o = await call('/api/auth/google', { idToken, deviceId: deviceId() }, true); if (o.token) { token = o.token; LS.set('rg_token', token); API.playerId = o.playerId; LS.set('rg_pid', o.playerId); } return o; },
      // ----- pagamento no site (PIX / cartão) -----
      payCreate: (productId, method, email) => call('/api/pay/create', { productId, method, email }),
      payCheck: (ref) => call('/api/pay/check?ref=' + encodeURIComponent(ref)),
    };
  }

  // ---------- Modo demonstração (tudo no aparelho, só para testar) ----------
  function Local() {
    const Eco = window.Economy;
    let mem = null, run = null; const pend = {};
    const load = () => { if (mem) return mem; try { mem = JSON.parse(LS.get('rg_demo')); } catch (e) {} return mem || (mem = Eco.newPlayer(Date.now())); };
    const save = () => LS.set('rg_demo', JSON.stringify(mem));
    const wrap = (fn) => { const p = load(); const out = fn(p) || {}; if (!out.error) save(); return Object.assign({}, out, { player: Eco.publicView(p, Date.now()) }); };
    const delay = (v) => new Promise(r => setTimeout(() => r(v), 120));
    return {
      demo: true,
      init: () => delay(wrap(() => ({ ok: true }))),
      start: (level, bonus, loadout) => delay(wrap(p => { const r = Eco.startLevel(p, level, Date.now(), bonus, loadout); if (r.error) return r; run = { cfg: r.cfg, startedAt: Date.now() }; return { ok: true, runId: 'demo', cfg: r.cfg }; })),
      finish: (runId, actions) => delay(wrap(p => { if (!run) return { error: 'Partida não encontrada' }; const r = Eco.finishLevel(p, run, actions, Date.now(), Math.random); run = null; return r; })),
      multiRooms: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiCreate: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiJoin: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiState: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiStart: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiAction: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiSync: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiFinish: () => delay({ error: 'Multiplayer exige conexão com o servidor online.' }),
      multiLeave: () => delay({ ok: true }),
      upgrade: (t) => delay(wrap(p => Eco.upgrade(p, t))),
      buy: (i) => delay(wrap(p => Eco.buyShop(p, i, Date.now()))),
      daily: () => delay(wrap(p => Eco.claimDaily(p, Date.now(), Math.random))),
      chest: (type, pay) => delay(wrap(p => Eco.openChest(p, type, Math.random, Date.now(), pay))),
      offer: (i) => delay(wrap(p => Eco.buyOffer(p, i, Date.now()))),
      verifyPurchase: (productId) => delay(wrap(p => Eco.grantIap(p, productId))),
      account: () => delay({ ok: true, google: null, hasCode: false, purchases: [] }),
      leaderboard: () => delay({ ok: true, players: [] }),
      emailStart: () => delay({ error: 'Cadastro por e-mail exige o servidor online.' }),
      emailVerify: () => delay({ error: 'Cadastro por e-mail exige o servidor online.' }),
      emailLogin: () => delay({ error: 'Login por e-mail exige o servidor online.' }),
      recoveryStart: () => delay({ error: 'Recuperação por e-mail/SMS exige o servidor online.' }),
      recoveryVerify: () => delay({ error: 'Recuperação por e-mail/SMS exige o servidor online.' }),
      phoneStart: () => delay({ error: 'Vincular telefone exige o servidor online.' }),
      phoneVerify: () => delay({ error: 'Vincular telefone exige o servidor online.' }),
      newCode: () => delay({ ok: true, code: 'RG-DEMO-0000-0000' }),
      recover: () => delay({ error: 'Na demonstração a conta fica só neste aparelho. No jogo online o código funciona.' }),
      google: () => delay({ error: 'Login com Google funciona no jogo online.' }),
      payCreate: (productId) => { const ref = 'demo.' + productId + '.' + Date.now(); pend[ref] = 0; return delay({ ok: true, ref, qr: '00020126-PIX-DE-DEMONSTRACAO-' + productId, qrImage: '' }); },
      payCheck: (ref) => delay(wrap(p => { if (pend[ref] === undefined) return { ok: true, paid: true }; if (++pend[ref] < 3) return { ok: true, paid: false }; delete pend[ref]; Eco.grantIap(p, ref.split('.')[1]); return { ok: true, paid: true }; })),
    };
  }

  const C = window.GAME_CONFIG || {};
  const base = (C.API_URL || '').replace(/\/$/, '');
  const API = window.API = C.DEMO === false || base ? Remote(base) : Local();
})();
