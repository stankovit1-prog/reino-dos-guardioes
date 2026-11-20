/* PAINEL DO MESTRE — usa o mesmo login do jogo. O servidor só responde se a conta for a do mestre. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const main = $('main');
  const LS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const token = LS('rg_token'), myId = LS('rg_pid');
  const base = (((window.GAME_CONFIG || {}).API_URL) || '').replace(/\/$/, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = (t) => t ? new Date(Number(t)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
  let toastT;
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }

  async function call(path, body) {
    try {
      const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = await r.json().catch(() => ({ error: 'Erro no servidor' }));
      if (r.status === 404 && path.startsWith('/api/admin/overview')) j.denied = true;
      return j;
    } catch (e) { return { error: 'Sem conexão' }; }
  }
  const ok = (o, msg) => { if (o.error) { toast('⚠️ ' + o.error); return false; } if (msg) toast(msg); return true; };

  let OV = null, tab = 'resumo';
  function tabs() {
    const t = [['resumo', '📊 Resumo'], ['jogadores', '👥 Jogadores'], ['eventos', '🎉 Eventos'], ['eu', '👑 Minha conta']];
    return '<div class="tabs">' + t.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('') + '</div>';
  }
  function render(html) {
    main.innerHTML = tabs() + html;
    main.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => go(b.dataset.tab); });
  }
  function go(t) { tab = t; ({ resumo, jogadores, eventos, eu })[t](); }

  // ---------- RESUMO ----------
  async function resumo() {
    OV = await call('/api/admin/overview'); if (!ok(OV)) return;
    const s = OV.stats, L = OV.live;
    render(`
      <div class="card"><h2>Hoje (últimas 24h)</h2><div class="grid">
        <div class="stat"><small>Vendas</small><b>${brl(s.salesToday.s)}</b><small>${fmt(s.salesToday.n)} compras</small></div>
        <div class="stat"><small>Jogadores novos</small><b>${fmt(s.newPlayers)}</b></div>
      </div></div>
      <div class="card"><h2>Total</h2><div class="grid">
        <div class="stat"><small>Faturamento</small><b>${brl(s.sales.s)}</b><small>${fmt(s.sales.n)} compras</small></div>
        <div class="stat"><small>Jogadores</small><b>${fmt(s.players)}</b></div>
        <div class="stat"><small>Suspensos</small><b>${fmt(s.banned)}</b></div>
        <div class="stat"><small>Conteúdo</small><b>${OV.game.worlds.length} mundos</b><small>${OV.game.levels} fases · ${OV.game.weapons} armas</small></div>
      </div>
      <p class="muted">Evento agora: moedas ${L.coinMul}x · gemas ${L.gemMul}x${L.maint ? ' · <b style="color:#f66">EM MANUTENÇÃO</b>' : ''}${L.gift ? ' · presente ativo' : ''} · banco: ${esc(OV.banco)}</p></div>
      <div class="card"><h2>Últimas compras</h2>${salesTable(OV.sales)}</div>`);
    main.querySelectorAll('[data-pid]').forEach((r) => { r.onclick = () => player(r.dataset.pid); });
  }
  function salesTable(list) {
    if (!list.length) return '<p class="muted">Nenhuma compra ainda.</p>';
    const name = (id) => OV && OV.game.products[id] ? OV.game.products[id].gems + ' 💎' : id;
    return '<table><tr><th>Quando</th><th>Produto</th><th>Valor</th><th>Via</th><th>Status</th></tr>' + list.map((x) =>
      `<tr class="click" data-pid="${esc(x.player)}"><td>${date(x.at)}</td><td>${esc(name(x.product))}</td><td>${x.amount ? brl(x.amount) : '-'}</td><td>${x.provider === 'mercadopago' ? 'PIX/cartão' : x.provider === 'google_play' ? 'Google Play' : esc(x.provider)}</td><td><span class="tag ${x.state === 'ok' ? 'ok' : x.state === 'refunded' ? 'red' : ''}">${x.state === 'ok' ? 'pago' : x.state === 'refunded' ? 'estornado' : esc(x.state)}</span></td></tr>`).join('') + '</table>';
  }

  // ---------- JOGADORES ----------
  async function jogadores(q) {
    render(`<div class="card"><h2>Buscar jogador</h2><div class="row"><input id="q" placeholder="Nome, e-mail ou ID" value="${esc(q || '')}"><button class="gold" id="qb" style="flex:0 0 auto">Buscar</button></div></div><div class="card" id="plist"><p class="muted">Carregando…</p></div>`);
    $('qb').onclick = () => jogadores($('q').value.trim());
    $('q').onkeydown = (e) => { if (e.key === 'Enter') jogadores($('q').value.trim()); };
    const o = await call('/api/admin/players?q=' + encodeURIComponent(q || '')); if (!ok(o)) return;
    $('plist').innerHTML = o.players.length ? '<table><tr><th>Jogador</th><th>Fase</th><th>🪙</th><th>💎</th><th>Desde</th></tr>' + o.players.map((p) =>
      `<tr class="click" data-pid="${esc(p.id)}"><td><b>${esc(p.name)}</b>${p.id === myId ? ' <span class="tag ok">você</span>' : ''}${p.banned ? ' <span class="tag red">suspenso</span>' : ''}<br><span class="muted">${esc(p.email || p.id.slice(0, 8))}</span></td><td>${p.maxLevel}</td><td>${fmt(p.coins)}</td><td>${fmt(p.gems)}</td><td>${date(p.created)}</td></tr>`).join('') + '</table>' : '<p class="muted">Ninguém encontrado.</p>';
    main.querySelectorAll('[data-pid]').forEach((r) => { r.onclick = () => player(r.dataset.pid); });
  }

  async function player(id) {
    tab = 'jogadores';
    const o = await call('/api/admin/player/' + encodeURIComponent(id)); if (!ok(o)) return;
    const d = o.data, cards = Object.entries(d.cards || {}).filter(([, n]) => n > 0).length;
    const chests = OV ? OV.game.chests : ['madeira', 'prata', 'ouro', 'magico', 'lendario', 'divino'];
    render(`
      <div class="card"><h2>${esc(d.name)} ${id === myId ? '<span class="tag ok">você</span>' : ''} ${o.banned ? '<span class="tag red">suspenso</span>' : ''}</h2>
        <p class="muted">ID: <span style="user-select:all">${esc(id)}</span><br>Login: ${o.logins.map(esc).join(', ') || '-'}${d.email ? ' · ' + esc(d.email) : ''}<br>Criado: ${date(o.created)} · Alertas de trapaça: ${o.cheats}</p>
        <div class="grid">
          <div class="stat"><small>Fase máxima</small><b>${d.maxLevel}</b></div>
          <div class="stat"><small>Moedas</small><b>${fmt(d.coins)}</b></div>
          <div class="stat"><small>Gemas</small><b>${fmt(d.gems)}</b></div>
          <div class="stat"><small>Armas / cartas</small><b>${(d.unlocked || []).length}</b><small>${cards} tipos de carta</small></div>
        </div></div>
      <div class="card"><h2>✏️ Alterar valores</h2>
        <div class="row"><div><label>Moedas</label><input id="e-coins" type="number" value="${d.coins}"></div><div><label>Gemas</label><input id="e-gems" type="number" value="${d.gems}"></div></div>
        <div class="row"><div><label>Energia</label><input id="e-energy" type="number" value="${d.energy}"></div><div><label>Fase máxima liberada</label><input id="e-level" type="number" value="${d.maxLevel}"></div></div>
        <label>Nome</label><input id="e-name" value="${esc(d.name)}">
        <div class="row"><button class="gold" id="e-save">💾 Salvar</button></div></div>
      <div class="card"><h2>🎁 Dar presentes</h2>
        <div class="row"><button id="g-1">+1.000 🪙</button><button id="g-2">+100 💎</button><button id="g-3">+100.000 🪙 e 10.000 💎</button></div>
        <div class="row"><select id="g-ct">${chests.map((c) => `<option>${esc(c)}</option>`).join('')}</select><input id="g-cn" type="number" value="1" min="1" max="50"><button id="g-c">Dar baús</button></div>
        <div class="row"><button id="g-all">🃏 +50 cartas de TODAS as armas</button><button id="g-unl">🔓 Liberar todas armas e fases</button></div></div>
      <div class="card"><h2>⚠️ Ações sérias</h2>
        <div class="row"><button class="${o.banned ? 'green' : 'red'}" id="x-ban">${o.banned ? '✅ Reativar conta' : '⛔ Suspender conta'}</button><button class="red" id="x-reset">♻️ Zerar progresso</button></div></div>
      <div class="card"><h2>🧾 Compras desta conta</h2>${salesTable(o.purchases.map((x) => Object.assign({ player: id }, x)))}</div>
      <div class="card"><h2>Dados completos</h2><pre>${esc(JSON.stringify(d, null, 1))}</pre></div>`);
    const act = async (body, msg) => { const r = await call('/api/admin/player/' + encodeURIComponent(id), body); if (ok(r, msg)) player(id); };
    $('e-save').onclick = () => act({ op: 'set', coins: $('e-coins').value, gems: $('e-gems').value, energy: $('e-energy').value, maxLevel: $('e-level').value, name: $('e-name').value }, 'Salvo ✅');
    $('g-1').onclick = () => act({ op: 'add', coins: 1000 }, '+1.000 moedas');
    $('g-2').onclick = () => act({ op: 'add', gems: 100 }, '+100 gemas');
    $('g-3').onclick = () => act({ op: 'add', coins: 100000, gems: 10000 }, 'Saldo turbinado 💰');
    $('g-c').onclick = () => act({ op: 'chest', type: $('g-ct').value, n: $('g-cn').value }, 'Baús entregues (já abertos na conta)');
    $('g-all').onclick = () => act({ op: 'cards', k: '*', n: 50 }, 'Cartas entregues 🃏');
    $('g-unl').onclick = () => { if (confirm('Liberar TODAS as armas e fases para esta conta?')) act({ op: 'unlockAll' }, 'Tudo liberado 🔓'); };
    $('x-ban').onclick = () => { if (confirm(o.banned ? 'Reativar esta conta?' : 'Suspender esta conta? O jogador não conseguirá jogar.')) act({ op: 'ban', v: !o.banned }, 'Feito'); };
    $('x-reset').onclick = () => { if (prompt('Isto apaga o progresso (fases, armas, moedas). As compras continuam registradas. Digite ZERAR para confirmar:') === 'ZERAR') act({ op: 'reset' }, 'Progresso zerado'); };
  }

  // ---------- EVENTOS AO VIVO ----------
  async function eventos() {
    if (!OV) { OV = await call('/api/admin/overview'); if (!ok(OV)) return; }
    const L = OV.live;
    render(`
      <div class="card"><h2>🎉 Evento de recompensas</h2><p class="muted">Multiplica moedas e gemas ganhas ao vencer fases. Vale na hora, para todos.</p>
        <div class="row"><div><label>Moedas (1 = normal)</label><select id="l-c">${[1, 1.5, 2, 3, 5].map((v) => `<option ${L.coinMul == v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label>Gemas (1 = normal)</label><select id="l-g">${[1, 1.5, 2, 3].map((v) => `<option ${L.gemMul == v ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
        <div class="row"><button class="gold" id="l-save">Salvar evento</button></div></div>
      <div class="card"><h2>📢 Aviso na tela inicial</h2><textarea id="l-news" rows="2" maxlength="300" placeholder="Ex.: Fim de semana de moedas em dobro! 🎉">${esc(L.news)}</textarea>
        <div class="row"><button class="gold" id="l-nsave">Publicar aviso</button><button id="l-nclr">Remover aviso</button></div></div>
      <div class="card"><h2>🎁 Presente para TODOS os jogadores</h2><p class="muted">Cada conta recebe 1 vez, na próxima vez que abrir o jogo. ${L.gift ? `<br><b>Ativo:</b> ${fmt(L.gift.coins)} 🪙 + ${fmt(L.gift.gems)} 💎 — "${esc(L.gift.msg)}"` : ''}</p>
        <div class="row"><div><label>Moedas</label><input id="l-gc" type="number" value="500"></div><div><label>Gemas</label><input id="l-gg" type="number" value="20"></div></div>
        <label>Mensagem</label><input id="l-gm" maxlength="120" value="Obrigado por jogar Reino dos Guardiões!">
        <div class="row"><button class="gold" id="l-gift">Enviar presente</button>${L.gift ? '<button id="l-gstop">Encerrar presente</button>' : ''}</div></div>
      <div class="card"><h2>🛠️ Manutenção</h2><p class="muted">Bloqueia novas partidas para todos (menos você). Use durante atualizações grandes.</p>
        <div class="row"><button class="${L.maint ? 'green' : 'red'}" id="l-maint">${L.maint ? '✅ Encerrar manutenção' : '🛠️ Ativar manutenção'}</button></div></div>`);
    const save = async (body, msg) => { const r = await call('/api/admin/live', body); if (ok(r, msg)) { OV.live = r.live; eventos(); } };
    $('l-save').onclick = () => save({ coinMul: $('l-c').value, gemMul: $('l-g').value }, 'Evento salvo 🎉');
    $('l-nsave').onclick = () => save({ news: $('l-news').value.trim() }, 'Aviso publicado 📢');
    $('l-nclr').onclick = () => save({ news: '' }, 'Aviso removido');
    $('l-gift').onclick = () => { if (confirm('Enviar este presente para TODOS os jogadores?')) save({ gift: { coins: $('l-gc').value, gems: $('l-gg').value, msg: $('l-gm').value } }, 'Presente enviado 🎁'); };
    if ($('l-gstop')) $('l-gstop').onclick = () => save({ gift: null }, 'Presente encerrado');
    $('l-maint').onclick = () => save({ maint: !L.maint }, L.maint ? 'Jogo liberado' : 'Manutenção ativada');
  }

  // ---------- MINHA CONTA (mestre) ----------
  function eu() { if (myId) player(myId); else toast('Abra o jogo primeiro'); }

  // ---------- início ----------
  (async function boot() {
    if (!token) { main.innerHTML = '<div class="card"><p>Abra o jogo neste aparelho e entre na sua conta de mestre primeiro.</p><a href="./"><button class="gold">Abrir o jogo</button></a></div>'; return; }
    OV = await call('/api/admin/overview');
    if (OV.denied || OV.error) { main.innerHTML = '<div class="card"><p>Página não encontrada.</p><a href="./"><button class="gold">Voltar ao jogo</button></a></div>'; return; }
    resumo();
  })();
})();
