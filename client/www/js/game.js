/* Reino dos Guardiões — app (telas, partida, loja). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
  const T = Sim.TOWERS, E = Sim.ECON;
  let P = null;               // jogador (vindo do servidor)
  let busy = false;

  // ---------------- utilidades de UI ----------------
  let toastT;
  const SND = window.Sound || { shot() {}, fx() {}, card() {}, music() {} };
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  function modal(html) { $('modal-box').innerHTML = html; $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); }
  window.closeModal = closeModal;
  window.__toast = (m) => toast(m);
  const homeMusic = () => SND.music(P ? Sim.worldInfo(Math.min(P.maxLevel + 1, Sim.WORLDS.length * Sim.LEVELS_PER_WORLD)).theme : -1, false);
  function setPlayer(out) {
    if (out && out.player) { P = out.player; renderTop(); }
    return out;
  }
  // Aviso do mestre, presente para todos e botão do painel (só aparece para o mestre)
  function liveInfo(out) {
    const ab = $('admin-btn'); if (ab) ab.classList.toggle('hidden', !out.isAdmin);
    const nb = $('news-bar'); if (nb) { nb.textContent = out.news ? '📢 ' + out.news : ''; nb.classList.toggle('hidden', !out.news); }
    if (out.gift) setTimeout(() => modal(`<h2>🎁 Presente!</h2><p>${(out.gift.msg || 'Um presente do Reino para você!').replace(/[<>&]/g, '')}</p>
      <div class="news" style="text-align:center;font-size:20px;font-weight:800">${out.gift.coins ? '🪙 ' + out.gift.coins + ' ' : ''}${out.gift.gems ? '💎 ' + out.gift.gems : ''}</div>
      <button class="btn gold" onclick="closeModal()" style="width:100%">Obrigado!</button>`), 600);
  }
  async function act(promise) {
    if (busy) return {}; busy = true;
    try { const out = setPlayer(await promise); if (out.error) toast(out.error); return out; }
    finally { busy = false; }
  }

  function go(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('s-' + name).classList.add('active');
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
    if (name === 'home') renderLevels();
    if (name === 'upgrades') renderUpgrades();
    if (name === 'shop') renderShop();
  }
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

  // ---------------- barra superior ----------------
  let energyTimer;
  function renderTop() {
    if (!P) return;
    $('v-coins').textContent = fmt(P.coins);
    $('v-gems').textContent = fmt(P.gems);
    $('v-energy').textContent = P.energy + '/' + E.ENERGY_MAX;
    clearInterval(energyTimer);
    const until = Date.now() + (P.nextEnergyIn || 0);
    const tick = () => {
      const ms = until - Date.now();
      if (P.energy >= E.ENERGY_MAX || !P.nextEnergyIn) { $('v-energy-t').textContent = ''; return; }
      if (ms <= 0) { $('v-energy-t').textContent = ''; clearInterval(energyTimer); API.init().then(setPlayer); return; }
      $('v-energy-t').textContent = Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    };
    tick(); energyTimer = setInterval(tick, 1000);
    $('daily-btn').classList.toggle('hidden', !P.dailyAvailable);
    renderFreeChest();
  }
  $('r-energy').addEventListener('click', () => {
    if (P.energy >= E.ENERGY_MAX) return toast('Energia cheia! Cada fase gasta ⚡1 (vitória devolve).');
    modal(`<h2>⚡ Energia</h2><p>Cada fase usa 1 de energia. Se vencer, você recebe de volta! Recarrega 1 a cada ${E.ENERGY_REGEN_MIN} min.</p>
      <div class="row"><button class="btn" onclick="closeModal()">Esperar</button><button class="btn pink" id="m-refill">Encher 💎${E.SHOP.energia.gems}</button></div>`);
    $('m-refill').onclick = async () => { const o = await act(API.buy('energia')); if (o.ok) { closeModal(); toast('Energia cheia! ⚡'); } };
  });

  // ---------------- recompensa diária ----------------
  const rwIcon = (r) => r.chest ? E.CHESTS[r.chest].icon : r.gems ? '💎' + r.gems : '🪙' + fmt(r.coins);
  $('daily-btn').addEventListener('click', () => {
    const next = P.dailyNext || 1, start = next - ((next - 1) % E.DAILY.length);
    const days = E.DAILY.map((_, i) => { const r = Economy.dailyReward(start + i), cur = start + i === next;
      return `<div class="${cur ? 'on' : start + i < next ? 'got' : ''}">Dia ${i + 1}<br><span style="font-size:16px">${rwIcon(r)}</span>${r.chest && r.gems ? '<br>+💎' + r.gems : ''}</div>`; }).join('');
    modal(`<h2>🎁 Presente diário</h2><p>Entre todo dia sem falhar! Os baús ficam melhores a cada semana.</p>
      <p class="tiny">🔥 Sequência: <b>${(P.daily && P.daily.last >= 0 && next > 1) ? next - 1 : 0} dias</b>${P.daily && P.daily.best ? ' · recorde ' + P.daily.best : ''}</p>
      <div class="days">${days}</div><button class="btn gold" id="m-claim" style="width:100%">Resgatar dia ${((next - 1) % E.DAILY.length) + 1}</button>`);
    $('m-claim').onclick = async () => {
      const o = await act(API.daily()); if (!o.ok) return;
      closeModal();
      const r = o.reward;
      toast('Dia ' + o.day + ': ' + [r.coins && '🪙' + fmt(r.coins), r.gems && '💎' + r.gems, r.chest && E.CHESTS[r.chest].name].filter(Boolean).join(' + ') + '!');
      if (o.chest) showChest(o.chest);
    };
  });

  // ---------------- CONTA (não perder progresso nem compras) ----------------
  async function accountModal() {
    const a = await act(API.account()); if (a.error) return;
    const gcid = (window.GAME_CONFIG || {}).GOOGLE_CLIENT_ID;
    modal(`<h2>👤 Minha conta</h2>
      <p class="tiny">Seu progresso e suas compras ficam guardados no servidor, na sua conta. Para não perder ao trocar de celular ou passar do site para o app:</p>
      <div class="news">${a.google ? `✅ Conectado com Google<br><b>${a.google}</b>` : '⚠️ Você está como <b>convidado</b>. Conecte sua conta!'}</div>
      ${a.google ? '' : `<div id="g-btn" style="display:flex;justify-content:center;margin:8px 0"></div>${gcid || API.demo ? '' : '<p class="tiny">(Login com Google ainda não configurado)</p>'}`}
      <button class="btn gold" id="m-code" style="width:100%;margin-top:6px">🔑 ${a.hasCode ? 'Gerar novo' : 'Criar'} código de recuperação</button>
      <button class="btn" id="m-rec" style="width:100%;margin-top:6px">📲 Recuperar conta com código</button>
      ${a.id ? `<p class="tiny" style="margin-top:10px">ID da conta: <b style="user-select:all;-webkit-user-select:all">${a.id}</b></p>` : ''}
      ${a.purchases && a.purchases.length ? `<p class="tiny" style="margin-top:10px">Compras na conta: ${a.purchases.filter(x => x.state === 'ok').length}</p>` : ''}
      <button class="btn" onclick="closeModal()" style="width:100%;margin-top:8px;background:#555;box-shadow:none">Fechar</button>`);
    if (!a.google) googleButton($('g-btn'));
    $('m-code').onclick = async () => {
      const o = await act(API.newCode()); if (!o.ok) return;
      modal(`<h2>🔑 Seu código</h2><p>Anote ou tire print. Com ele você entra na sua conta em qualquer celular, no site ou no app.</p>
        <div class="news" style="text-align:center;font-size:22px;font-weight:800;letter-spacing:1px;user-select:all;-webkit-user-select:all">${o.code}</div>
        <p class="tiny">Não mostre para ninguém. Criar um novo código cancela o anterior.</p>
        <button class="btn gold" id="m-cc" style="width:100%">📋 Copiar</button><button class="btn" onclick="closeModal()" style="width:100%;margin-top:6px;background:#555;box-shadow:none">Pronto</button>`);
      $('m-cc').onclick = () => { try { navigator.clipboard.writeText(o.code); toast('Copiado!'); } catch (e) { toast('Selecione e copie o código'); } };
    };
    $('m-rec').onclick = () => {
      modal(`<h2>📲 Recuperar conta</h2><p>Digite o código de recuperação:</p><input id="m-rc" class="inp" placeholder="RG-XXXX-XXXX-XXXX" style="text-transform:uppercase;text-align:center;font-size:18px">
        <p class="tiny">⚠️ O progresso de convidado deste aparelho será trocado pela conta do código.</p>
        <button class="btn gold" id="m-rgo" style="width:100%">Entrar</button><button class="btn" onclick="closeModal()" style="width:100%;margin-top:6px;background:#555;box-shadow:none">Cancelar</button>`);
      $('m-rgo').onclick = async () => { const o = await act(API.recover($('m-rc').value)); if (o.ok !== false && o.token) { liveInfo(o); closeModal(); toast('Conta recuperada! 🎉'); go('home'); } };
    };
  }
  // Botão "Entrar com Google": no site usa Google Identity; no app Android usa o plugin de login
  async function googleButton(el) {
    const gcid = (window.GAME_CONFIG || {}).GOOGLE_CLIENT_ID;
    const done = async (idToken) => { const o = await act(API.google(idToken)); if (o.token) { liveInfo(o); closeModal(); toast(o.linked ? 'Conta Google conectada! Seu progresso está salvo ☁️' : 'Bem-vindo de volta! Conta carregada ☁️'); go('home'); } };
    const cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const SL = cap.Plugins && cap.Plugins.SocialLogin;
      if (!SL || !gcid) return;
      el.innerHTML = '<button class="btn" style="background:#fff;color:#333;box-shadow:0 3px 0 #999;width:100%">🇬 Entrar com Google</button>';
      el.firstChild.onclick = async () => { try { await SL.initialize({ google: { webClientId: gcid } }); const r = await SL.login({ provider: 'google', options: {} }); const t = r && r.result && (r.result.idToken || (r.result.responseType === 'online' && r.result.idToken)); if (t) done(t); else toast('Não foi possível entrar com Google'); } catch (e) { toast('Login cancelado'); } };
      return;
    }
    if (API.demo) { el.innerHTML = '<button class="btn" style="background:#fff;color:#333;box-shadow:0 3px 0 #999;width:100%">🇬 Entrar com Google</button>'; el.firstChild.onclick = () => toast('No jogo online, aqui entra com sua conta Google'); return; }
    if (!gcid) return;
    const start = () => { try { google.accounts.id.initialize({ client_id: gcid, callback: (r) => done(r.credential) }); google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill' }); } catch (e) {} };
    if (window.google && window.google.accounts) return start();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = start; document.head.appendChild(s);
  }


  // Feedback visual imediato nos ícones e links, sem bloquear a jogabilidade.
  document.addEventListener('click', ev => {
    const link = ev.target.closest('a[href]');
    if (link && link.target !== '_blank' && link.getAttribute('href') !== '#') $('loading').classList.remove('hidden');
    const button = ev.target.closest('button');
    if (button && !button.disabled) {
      button.classList.add('tap-busy');
      setTimeout(() => button.classList.remove('tap-busy'), 650);
    }
  }, true);
  $('acc-btn').onclick = () => accountModal();
  $('profile-account').onclick = () => accountModal();

  // Perfil, ranking e convites usam os dados reais do jogador e do servidor.
  function renderCommunity() {
    if (!P) return;
    const level = Math.max(1, (P.maxLevel | 0) + 1);
    $('profile-name').textContent = P.name || 'Guardião';
    $('profile-level').textContent = 'Nível ' + level + ' · ' + (P.maxLevel >= 40 ? 'Veterano' : P.maxLevel >= 10 ? 'Explorador' : 'Iniciante');
    const list = $('leaderboard-list');
    if (!list) return;
    list.innerHTML = '<li>Carregando ranking…</li>';
    API.leaderboard().then(out => {
      if (out.error || !Array.isArray(out.players) || !out.players.length) {
        list.innerHTML = '<li>Ranking indisponível no momento.</li>'; return;
      }
      list.innerHTML = out.players.slice(0, 10).map(p => '<li><span>' + (p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank - 1] : '#' + p.rank) + '</span><span>' + String(p.name || 'Guardião').replace(/[<>&"]/g, '') + '</span><b>Nível ' + (p.level + 1) + '</b></li>').join('');
    }).catch(() => { list.innerHTML = '<li>Não foi possível carregar o ranking.</li>'; });
  }
  function inviteUrl() { return location.href.split('#')[0]; }
  function inviteText() { return 'Venha defender o reino comigo em Reino dos Guardiões! ' + inviteUrl(); }
  function shareFallback() {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(inviteText()).then(() => toast('Convite copiado!'));
    toast('Copie o endereço do jogo para convidar seus amigos.');
  }
  $('share-whatsapp').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(inviteText()), '_blank', 'noopener');
  $('share-facebook').onclick = () => window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(inviteUrl()), '_blank', 'noopener');
  $('share-instagram').onclick = async () => {
    try { if (navigator.share) await navigator.share({ title: 'Reino dos Guardiões', text: inviteText(), url: inviteUrl() }); else await shareFallback(); }
    catch (e) { if (e.name !== 'AbortError') shareFallback(); }
  };
  $('share-copy').onclick = shareFallback;
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.mode;
    if (mode === 'solo' || mode === 'campaign') { go('home'); $('levels').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (mode === 'friends') { $('share-whatsapp').click(); return; }
    toast(mode === 'online' ? 'Partidas online ainda precisam da infraestrutura de salas e sincronização.' : 'Torneios serão liberados após a implementação do modo multiplayer.');
  }));


  // ---------------- mapa de fases ----------------
  function renderLevels() {
    const box = $('levels');
    const max = P.maxLevel + 1;
    const show = Math.ceil(Math.max(max + 8, 20) / Sim.LEVELS_PER_WORLD) * Sim.LEVELS_PER_WORLD;
    const sec = P.secrets || {};
    let html = '';
    for (let l = 1; l <= show; l++) {
      const st = P.stars[l] | 0;
      const cls = l < max ? 'done' : l === max ? 'cur' : 'lock';
      const W = Sim.worldInfo(l);
      const zz = ['', 'zl', '', 'zr'][(l - 1) % 4];
      html += `<button class="lv ${cls} ${zz} ${Sim.isBossLevel(l) ? 'boss' : ''}" data-l="${l}" style="--wc:${THEMES[W.theme].ui}">${cls === 'lock' ? '🔒' : l}${l < max ? `<span class="st">${'⭐'.repeat(st)}</span>` : ''}${sec[l] === 'found' ? '<span class="key">🗝️</span>' : ''}${Sim.partsOf(l) > 1 ? `<span class="parts">${'▮'.repeat(Sim.partsOf(l))}</span>` : ''}${l > P.maxLevel && E.milestone(l) ? `<span class="ms">${E.CHESTS[E.milestone(l)].icon}</span>` : ''}</button>`;
      if (l % Sim.LEVELS_PER_WORLD === 1) html += `<div class="world-h" style="background:${THEMES[W.theme].ui}">${W.icon} Mundo ${W.num} — ${W.name}${W.cycle ? ` <small>(${['', 'Bronze', 'Prata', 'Ouro', 'Diamante'][Sim.tierOf(l)]})</small>` : ''}</div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('.lv').forEach(b => b.onclick = () => {
      const l = +b.dataset.l;
      if (l > max) return toast('Vença a fase ' + max + ' primeiro!');
      levelIntro(l);
    });
    const cur = box.querySelector('.cur');
    if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 30);
    $('hello').textContent = P.maxLevel ? `Fase ${max} te espera, ${P.name}!` : 'Defenda o reino dos monstros!';
  }

  const MON_ICON = { slime: '🟢', goblin: '👺', lobo: '🐺', morcego: '🦇', ogro: '👑', escorpiao: '🦂', mumia: '🧟', besouro: '🪲', abutre: '🦅', farao: '🗿',
    sapo: '🐸', mosquito: '🦟', croco: '🐊', xama: '🌿', bruxa: '🧙', pinguim: '🐧', yeti: '🦍', lobogelo: '🐺', espirito: '👻', golem: '🧊',
    diabrete: '😈', salamandra: '🦎', fenix: '🐦‍🔥', magma: '🌋', senhor: '🔥', ladrao: '💰',
    caranguejo: '🦀', pirata: '☠️', gaivota: '🕊️', polvo: '🐙', kraken: '🦑', zumbi: '🧟', esqueleto: '💀', fantasma: '👻', vampiro: '🦇', conde: '🧛',
    aranha: '🕷️', toupeira: '🐀', morcegocristal: '🦇', golemcristal: '💎', rainha: '🕸️', harpia: '🦅', duende: '🧚', nuvem: '🌩️', grifo: '🦁', tempestade: '⛈️',
    cavaleiro: '🛡️', demonio: '👹', sombra: '🌑', dragaonegro: '🐲', trevas: '👿', larva: '🪱', larvinha: '🪱' };
  function monsterNews(l) {
    const W = Sim.worldInfo(l), idx = (l - 1) % Sim.LEVELS_PER_WORLD + 1;
    const prev = idx === 1 ? [] : Sim.mobsAt(l - 1);
    const news = Sim.mobsAt(l).filter(m => prev.indexOf(m) < 0);
    if (idx === 10) news.push(W.boss);
    const tierUp = l > 1 && Sim.tierOf(l) > Sim.tierOf(l - 1);
    if (!news.length && !tierUp) return '';
    return `<div class="news">
      ${idx === 1 ? `<b style="color:#ffd43b">${W.icon} Novo mundo: ${W.name}!</b>` : '<b style="color:#ff8787">⚠ Novidade nesta fase</b>'}
      ${news.map(k => `<div>${MON_ICON[k]} <b>${Sim.ENEMIES[k].name}</b> — ${Sim.ENEMIES[k].desc}</div>`).join('')}
      ${tierUp ? `<div>🪖 Os monstros <b>evoluíram</b> e ganharam armadura ${['', 'de bronze', 'de prata', 'de ouro', 'de diamante'][Sim.tierOf(l)]}!</div>` : ''}</div>`;
  }
  function levelIntro(l) {
    const waves = 5 + Math.min(10, Math.floor(l / 4));
    const newT = Sim.TOWER_IDS.find(k => T[k].unlock === l);
    const sec = (P.secrets || {})[l];
    const secTxt = sec === 'found' ? '' : sec === 'done' ? '<p class="tiny">✅ Fase secreta concluída</p>'
      : Sim.hasSecret(l) ? '<div class="news" style="border:1px dashed #b197fc">🔍 Dizem que existe um <b>lugar misterioso</b> escondido neste mapa... toque nele!</div>' : '';
    const Wd = Sim.worldInfo(l), li = (l - 1) % Sim.LEVELS_PER_WORLD + 1;
    modal(`<h2>Fase ${l}${Sim.isBossLevel(l) ? ' 👑' : ''}</h2>
      <p class="tiny">${Wd.icon} Mundo ${Wd.num} — ${Wd.name} · fase ${li} de ${Sim.LEVELS_PER_WORLD}</p>
      <p>${waves} ondas de monstros${Sim.isBossLevel(l) ? ' + CHEFÃO' : ''}.<br>Não deixe chegarem ao castelo!</p>
      ${Sim.partsOf(l) > 1 ? `<div class="news" style="border:1px solid #ffd43b">🗺️ <b>Fase longa em ${Sim.partsOf(l)} partes!</b> O mapa continua depois de algumas ondas.</div>` : ''}
      ${newT ? `<p>Nova torre liberada: <b>${T[newT].icon} ${T[newT].name}</b></p>` : ''}
      ${monsterNews(l)}${secTxt}
      ${(l - 1) % Sim.LEVELS_PER_WORLD + 1 === 25 && !(P.relics || {})[l] ? '<div class="news" style="border:1px dashed #c92a2a">🗡️ Uma <b>ARMA SECRETA</b> está escondida neste mapa. Procure a relíquia brilhando!</div>' : ''}
      ${l > P.maxLevel && E.milestone(l) ? `<div class="news" style="border:1px solid #ffd43b">🎁 Recompensa especial ao vencer: <b>${E.CHESTS[E.milestone(l)].icon} ${E.CHESTS[E.milestone(l)].name}</b></div>` : ''}
      ${sec === 'found' ? `<button class="btn secret-btn" id="m-bonus">🗝️ Entrar na FASE SECRETA <small>(grátis, 1 vez)</small></button>` : ''}
      <div class="row"><button class="btn" onclick="closeModal()" style="background:#555;box-shadow:none">Voltar</button>
      <button class="btn gold" id="m-play">Jogar ⚡1</button></div>`);
    $('m-play').onclick = () => { closeModal(); startLevel(l); };
    if ($('m-bonus')) $('m-bonus').onclick = () => {
      modal(`<h2>🗝️ Caverna do Tesouro</h2><p>Goblins Ladrões estão fugindo com o tesouro do reino!<br>Derrote o máximo que puder. Cada um vale moedas, e pegar <b>todos</b> dá 💎8.</p>
        <p class="tiny">Você só pode jogar esta fase secreta uma vez.</p>
        <div class="row"><button class="btn" onclick="closeModal()" style="background:#555;box-shadow:none">Depois</button><button class="btn secret-btn" id="m-go">Entrar!</button></div>`);
      $('m-go').onclick = () => { closeModal(); startLevel(l, true); };
    };
  }

  // ---------------- melhorias ----------------
  const R = Sim.RARITIES;
  const owned = (k) => (P.owned || []).indexOf(k) >= 0;
  function renderUpgrades() {
    $('rar-legend').innerHTML = Sim.RARITY_IDS.filter(r => r !== 'secreta').map(r => `<span style="background:${R[r].color}">${R[r].name}${R[r].arena > P.maxLevel + 1 ? ' 🔒' + R[r].arena : ''}</span>`).join('');
    const RO = Sim.RARITY_IDS.concat('secreta');
    const ownedN = Sim.TOWER_IDS.filter(owned).length;
    $('up-list').innerHTML = `<div class="col-count">Você tem <b>${ownedN}</b> de <b>${Sim.TOWER_IDS.length}</b> armas</div>` + RO.map(rar => `<div class="rar-h" style="color:${R[rar].color}">${R[rar].name} (${Sim.TOWER_IDS.filter(k => T[k].rar === rar && owned(k)).length}/${Sim.TOWER_IDS.filter(k => T[k].rar === rar).length})</div>` + Sim.TOWER_IDS.filter(k => T[k].rar === rar).map(k => {
      const t = T[k], lvl = (P.perm[k] | 0), have = owned(k), cards = (P.cards || {})[k] | 0;
      const need = E.cardsNeed(lvl, t.rar), can = have && lvl < Sim.MAX_PERM && cards >= need;
      return `<div class="tcard ${have ? '' : 'locked'} ${can ? 'can' : ''} ${t.rar === 'divina' ? 'divina' : ''}" data-k="${k}" style="--rc:${R[t.rar].color}">
        ${have ? `<span class="tl">Nv ${lvl + 1}</span>` : ''}<div class="ti">${have ? t.icon : '❔'}</div>
        <span class="tn">${have ? t.name : '???'}</span><span class="tr">${R[t.rar].name}</span>
        ${have ? `<div class="cb"><i class="${can ? 'full' : ''}" style="width:${Math.min(100, cards / need * 100)}%"></i><span>${lvl >= Sim.MAX_PERM ? 'MÁX' : cards + '/' + need}</span></div>`
          : `<div class="cb"><span>${t.unlock ? 'Fase ' + t.unlock : t.rar === 'secreta' ? 'Relíquia' : 'Baús'}</span></div>`}</div>`;
    }).join('')).join('');
    $('up-list').querySelectorAll('.tcard').forEach(b => b.onclick = () => cardInfo(b.dataset.k));
  }
  function cardInfo(k) {
    const t = T[k], lvl = P.perm[k] | 0, have = owned(k), cards = (P.cards || {})[k] | 0;
    const need = E.cardsNeed(lvl, t.rar), cost = E.upCoins(lvl, t.rar);
    const fakeTw = { type: k, lvl: 1 }, st = Sim.towerStats({ perm: P.perm }, fakeTw);
    const powers = [t.splash && 'área', t.slow && 'lentidão', t.chain > 1 && t.chain + ' alvos', t.pierce && 'atravessa ' + t.pierce, t.zone && 'poder no chão', t.poison && 'veneno', t.knock && 'empurra', t.goldMul && '+' + t.goldMul + '% ouro', t.ground && 'não acerta voadores', t.range >= 9999 && 'mapa inteiro'].filter(Boolean);
    modal(`<div class="reveal ${t.rar === 'divina' ? 'divina' : ''}" style="--rc:${R[t.rar].color}"><div class="ti">${have ? t.icon : '❔'}</div><b>${have ? t.name : 'Arma misteriosa'}</b><small>${R[t.rar].name}${have ? ' · Nível ' + (lvl + 1) : ''}</small></div>
      ${have ? `<p>${t.desc}</p><p class="tiny">Dano ${st.dmg} · Alcance ${st.range >= 9999 ? '∞' : (st.range / 100).toFixed(1)} · Custo na fase 🪙${t.cost}<br>${powers.join(' · ')}</p>`
        : `<p>${t.rar === 'secreta' ? 'ARMA SECRETA: procure a relíquia 🗡️ escondida na fase 25 de um dos mundos (' + (Sim.SECRET_TOWERS.indexOf(k) + 1) + 'º mundo).' : t.unlock ? 'Libera de graça na fase ' + t.unlock + ' (ou antes, em baús).' : 'Só aparece em baús' + (R[t.rar].arena > P.maxLevel + 1 ? ' a partir da fase ' + R[t.rar].arena : '') + '.'}</p>`}
      ${have && lvl < Sim.MAX_PERM ? `<p>Próximo nível: <b>+5% de dano</b></p><div class="row"><button class="btn" onclick="closeModal()" style="background:#555;box-shadow:none">Fechar</button>
        <button class="btn gold" id="m-up" ${cards < need || P.coins < cost ? 'disabled' : ''}>🃏${cards}/${need} · 🪙${fmt(cost)}</button></div>` : '<button class="btn" onclick="closeModal()" style="width:100%">Fechar</button>'}`);
    if ($('m-up')) $('m-up').onclick = async () => { const o = await act(API.upgrade(k)); if (o.ok) { closeModal(); toast(t.icon + ' ' + t.name + ' subiu para o nível ' + ((P.perm[k] | 0) + 1) + '! 💪'); renderUpgrades(); } };
  }

  // ---------------- baús ----------------
  async function openChestFlow(type, pay) {
    const o = await act(API.chest(type, pay));
    if (!o.ok) return;
    showChest(o);
  }
  function showChest(res, then) {
    const C = E.CHESTS[res.chest] || { name: 'Cartas do Dia', icon: '🃏' };
    let i = -1;
    // primeiro os prêmios (moedas, gemas, energia), depois as cartas da menor para a maior raridade
    const prizes = [{ prize: 'gold', n: res.gold, jackpot: res.jackpot }];
    if (res.gems) prizes.push({ prize: 'gems', n: res.gems });
    if (res.energy) prizes.push({ prize: 'energy', n: res.energy });
    const cards = prizes.concat(res.cards.slice().sort((a, b) => Sim.RARITY_IDS.indexOf(a.rar) - Sim.RARITY_IDS.indexOf(b.rar)));
    const PZ = { gold: ['🪙', 'Moedas', '#ffd43b'], gems: ['💎', 'Gemas', '#f06595'], energy: ['⚡', 'Energia', '#74c0fc'] };
    const step = () => {
      i++;
      if (i >= cards.length) {
        modal(`<h2>${C.icon} ${C.name}</h2><div class="sum">${cards.filter(c => !c.prize).map(c => `<div style="--rc:${R[c.rar].color}">${T[c.k].icon} ${T[c.k].name} x${c.n}${c.isNew ? ' 🆕' : ''}</div>`).join('')}</div>
          <div class="rw"><span>🪙 +${fmt(res.gold)}</span>${res.gems ? `<span>💎 +${res.gems}</span>` : ''}${res.energy ? `<span>⚡ +${res.energy}</span>` : ''}</div><button class="btn gold" style="width:100%" id="m-chest-ok">${then ? 'Próximo baú ▶' : 'Legal!'}</button>`);
        $('m-chest-ok').onclick = (ev) => { ev.stopPropagation(); closeModal(); if (then) then(); };
        renderTop(); if ($('s-upgrades').classList.contains('active')) renderUpgrades(); if ($('s-shop').classList.contains('active')) renderShop();
        return;
      }
      const c = cards[i];
      if (c.prize) {
        SND.fx(c.prize === 'gold' ? 'coin' : 'gems');
        const z = PZ[c.prize];
        modal(`<div class="chest-open"><p class="tiny">${i + 1} de ${cards.length} · toque para continuar</p>
          <div class="reveal" style="--rc:${z[2]}">${c.jackpot ? '<span class="new">EM DOBRO!</span>' : ''}<div class="ti">${z[0]}</div><b>${z[1]}</b><h2 style="margin:6px 0 0">+${fmt(c.n)}</h2></div>
          ${c.jackpot ? '<p style="color:#ffd43b;font-weight:800">🎰 SORTE GRANDE! Moedas em dobro!</p>' : ''}</div>`);
        $('modal-box').onclick = () => { $('modal-box').onclick = null; step(); };
        return;
      }
      const t = T[c.k];
      SND.card(c.rar);
      modal(`<div class="chest-open"><p class="tiny">${i + 1} de ${cards.length} · toque para continuar</p>
        <div class="reveal ${c.rar === 'divina' ? 'divina' : ''}" style="--rc:${R[c.rar].color}">${c.isNew ? '<span class="new">NOVA ARMA!</span>' : ''}<div class="ti">${t.icon}</div><b>${t.name}</b><small>${R[c.rar].name}</small><h2 style="margin:6px 0 0">x${c.n}</h2></div>
        ${c.rar !== 'comum' ? `<p style="color:${R[c.rar].color};font-weight:800">✨ ${R[c.rar].name.toUpperCase()}! ✨</p>` : ''}</div>`);
      $('modal-box').onclick = () => { $('modal-box').onclick = null; step(); };
    };
    modal(`<div class="chest-open"><h2>${C.name}</h2><div class="chest-big" id="m-chest">${C.icon}</div><p>Toque no baú para abrir!</p></div>`);
    $('m-chest').onclick = (ev) => { ev.stopPropagation(); SND.fx('chest'); setTimeout(step, 350); };
  }
  function showChests(list) {                         // abre vários baús em sequência
    if (!list.length) return;
    const first = list.shift();
    showChest(first, () => showChests(list));
  }
  window.__showChest = showChest;
  let freeT;
  function renderFreeChest() {
    clearInterval(freeT);
    const until = Date.now() + (P.freeChestIn || 0), b = $('free-chest');
    const tick = () => {
      const ms = until - Date.now();
      if (ms <= 0) { b.classList.add('ready'); $('free-chest-t').textContent = 'Baú GRÁTIS pronto! Toque para abrir'; clearInterval(freeT); }
      else { b.classList.remove('ready'); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60; $('free-chest-t').textContent = `Próximo baú grátis em ${h}h ${String(m).padStart(2, '0')}min`; }
    };
    tick(); freeT = setInterval(tick, 20000);
  }
  $('free-chest').onclick = () => { if ((P.freeChestIn || 0) > 0 && !$('free-chest').classList.contains('ready')) return toast('Ainda não está pronto ⏳'); openChestFlow('madeira'); };

  // ---------------- loja ----------------
  function renderShop() {
    const st = E.IAP.pacote_inicial;
    $('starter').innerHTML = P.bought.pacote_inicial ? '' : `<div class="starter"><div class="big">🐉</div><div style="flex:1">
      <b>Pacote Inicial</b><p>Arma lendária Dragão + 💎${st.gems}. Só 1 vez!</p>
      <button class="btn gold" data-iap="pacote_inicial">${Billing.priceOf('pacote_inicial')}</button></div></div>`;
    $('chest-list').innerHTML = Object.keys(E.CHESTS).filter(id => id !== 'madeira').map(id => { const C = E.CHESTS[id], lock = P.maxLevel + 1 < C.min;
      const top = Object.keys(C.guar).concat(C.divineChance ? ['divina'] : []).map(r => R[r].name).join(' + ');
      return `<div class="prod chest">${C.divineChance ? '<span class="tag">Chance de DIVINA</span>' : ''}<div class="big">${C.icon}</div><b style="font-size:14px">${C.name}</b>
        <small>${C.n} cartas${top ? ' · garante ' + top : ''}</small>
        <button class="btn pink" data-chest="${id}" ${lock ? 'disabled' : ''}>${lock ? '🔒 Fase ' + C.min : '💎 ' + C.gems}</button>
        ${C.coins && !lock ? `<button class="btn gold" data-chestc="${id}" style="margin-top:6px;width:100%">🪙 ${fmt(C.coins)}</button>` : ''}</div>`; }).join('');
    document.querySelectorAll('[data-chest]').forEach(b => b.onclick = () => openChestFlow(b.dataset.chest, 'gems'));
    document.querySelectorAll('[data-chestc]').forEach(b => b.onclick = () => openChestFlow(b.dataset.chestc, 'coins'));
    const offs = P.offers || [], bought = P.offersBought || [];
    $('offer-list').innerHTML = offs.map(o => { const t = T[o.k], done = bought.indexOf(o.i) >= 0;
      return `<div class="tcard ${o.rar === 'divina' ? 'divina' : ''}" style="--rc:${R[o.rar].color}"><div class="ti">${t.icon}</div><span class="tn">${t.name}</span><span class="tr">${R[o.rar].name} · x${o.n}</span>
        <button class="btn ${o.gems ? 'pink' : 'gold'}" data-offer="${o.i}" ${done ? 'disabled' : ''} style="width:100%;padding:6px 2px;margin-top:4px;font-size:12px">${done ? 'Comprado' : o.gems ? '💎' + o.gems : '🪙' + fmt(o.coins)}</button></div>`; }).join('');
    document.querySelectorAll('[data-offer]').forEach(b => b.onclick = async () => { const o = await act(API.offer(+b.dataset.offer)); if (o.ok) showChest(o); });
    const icons = ['💎', '💰', '💰', '👑', '🏆'];
    $('iap-list').innerHTML = ['gemas_mini', 'gemas_p', 'gemas_m', 'gemas_g', 'gemas_xg'].map((id, i) =>
      `<div class="prod">${E.IAP[id].tag ? `<span class="tag">${E.IAP[id].tag}</span>` : ''}<div class="big">${icons[i]}</div>
       <b>💎 ${fmt(E.IAP[id].gems)}</b><button class="btn" data-iap="${id}">${Billing.priceOf(id)}</button></div>`).join('');
    $('shop-list').innerHTML = Object.keys(E.SHOP).map(id => {
      const it = E.SHOP[id];
      const owned = it.unlock && P.unlocked.includes(it.unlock);
      const ic = it.coins ? '🪙' : it.energy ? '⚡' : T[it.unlock].icon;
      return `<div class="prod"><div class="big">${ic}</div><b style="font-size:14px">${it.name}</b>
        <button class="btn pink" data-shop="${id}" ${owned ? 'disabled' : ''}>${owned ? 'Comprado' : '💎 ' + it.gems}</button></div>`;
    }).join('');
    $('pay-note').textContent = Billing.mode === 'demo' ? 'MODO DEMONSTRAÇÃO: as compras são simuladas e nada é cobrado.'
      : Billing.mode === 'webpay' ? 'Pagamento seguro por PIX ou cartão (Mercado Pago). Tudo fica salvo na sua conta.'
      : Billing.mode === 'web' ? 'Compras ainda não disponíveis neste site.' : 'Pagamento seguro pelo Google Play.';
    document.querySelectorAll('[data-iap]').forEach(b => b.onclick = () => buyIap(b.dataset.iap));
    document.querySelectorAll('[data-shop]').forEach(b => b.onclick = async () => {
      const o = await act(API.buy(b.dataset.shop)); if (o.ok) { toast('Comprado! ✨'); renderShop(); }
    });
  }
  // ===== PAGAMENTO NO SITE: PIX e cartão (Mercado Pago) =====
  const LSs = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  function webPay(id) {
    const it = E.IAP[id];
    modal(`<h2>💎 ${fmt(it.gems)} gemas</h2><p style="font-size:22px;font-weight:800;margin:4px 0">${it.price}</p>
      <p class="tiny">As gemas ficam salvas na SUA CONTA (site e app).</p>
      <input id="m-mail" type="email" placeholder="seu e-mail (para o comprovante)" value="${LSs.get('rg_mail') || P.email || ''}" class="inp">
      <button class="btn" id="m-pix" style="width:100%;margin-top:8px;background:linear-gradient(180deg,#38d9a9,#0ca678);box-shadow:0 3px 0 #087f5b">⚡ Pagar com PIX</button>
      <button class="btn gold" id="m-card" style="width:100%;margin-top:8px">💳 Pagar com cartão</button>
      <button class="btn" onclick="closeModal()" style="width:100%;margin-top:8px;background:#555;box-shadow:none">Cancelar</button>`);
    const go2 = async (method) => {
      const email = $('m-mail').value.trim(); LSs.set('rg_mail', email);
      const o = await act(API.payCreate(id, method, email)); if (!o.ok) return;
      LSs.set('rg_payref', o.ref);
      if (method === 'card') { try { window.open(o.url, '_blank'); } catch (e) {} waitPay(o.ref, id, `<p>Abrimos a página segura do Mercado Pago. Se não abriu, <a href="${o.url}" target="_blank" style="color:#ffd43b">toque aqui</a>.</p>`); return; }
      waitPay(o.ref, id, `${o.qrImage ? `<img src="data:image/png;base64,${o.qrImage}" style="width:210px;height:210px;background:#fff;border-radius:12px;padding:6px">` : '<div class="news" style="text-align:center">📱 QR code do PIX</div>'}
        <p class="tiny">Ou use o PIX copia e cola:</p><textarea id="m-qr" readonly class="inp" style="height:60px;font-size:10px">${o.qr || ''}</textarea>
        <button class="btn gold" id="m-copy" style="width:100%;margin-top:6px">📋 Copiar código PIX</button>`);
      if ($('m-copy')) $('m-copy').onclick = () => { const t = $('m-qr'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); } toast('Código PIX copiado!'); };
    };
    $('m-pix').onclick = () => go2('pix');
    $('m-card').onclick = () => go2('card');
  }
  let payTimer = null;
  function waitPay(ref, id, html) {
    modal(`<h2>Aguardando pagamento…</h2>${html}<p class="tiny" id="m-pst">⏳ Assim que o pagamento for aprovado, as gemas entram sozinhas.</p>
      <button class="btn" id="m-pclose" style="width:100%;margin-top:8px;background:#555;box-shadow:none">Fechar (continua conferindo)</button>`);
    $('m-pclose').onclick = () => closeModal();
    clearInterval(payTimer);
    let n = 0;
    payTimer = setInterval(async () => {
      if (++n > 300) return clearInterval(payTimer);
      const o = await API.payCheck(ref);
      if (o && o.paid) { clearInterval(payTimer); LSs.set('rg_payref', ''); setPlayer(o); closeModal(); SND.fx('pay'); toast('Pagamento aprovado! +💎' + E.IAP[id].gems + ' 🎉'); if ($('s-shop').classList.contains('active')) renderShop(); }
    }, 4000);
  }
  async function resumePay() {                       // voltou do cartão ou recarregou a página: confere a compra pendente
    const ref = LSs.get('rg_payref'); if (!ref || API.demo) return;
    const o = await API.payCheck(ref);
    if (o && o.paid) { LSs.set('rg_payref', ''); setPlayer(o); SND.fx('pay'); toast('Pagamento aprovado! Suas gemas chegaram 🎉'); }
    else if (o && !o.error) waitPay(ref, ref.split('.')[1], '<p>Conferindo seu pagamento…</p>');
  }

  async function buyIap(id) {
    if (Billing.mode === 'webpay') return webPay(id);
    if (Billing.mode === 'demo') {
      modal(`<h2>Modo demonstração</h2><p>No jogo de verdade: no <b>app</b> abre o Google Play e no <b>site</b> abre o PIX/cartão (${Billing.priceOf(id)}).</p>
        <div class="row"><button class="btn" style="background:#555;box-shadow:none" onclick="closeModal()">Cancelar</button><button class="btn gold" id="m-sim">Simular</button><button class="btn" id="m-simpix" style="background:linear-gradient(180deg,#38d9a9,#0ca678)">Ver PIX</button></div>`);
      $('m-sim').onclick = () => { closeModal(); Billing.buy(id); };
      $('m-simpix').onclick = () => webPay(id);
      return;
    }
    try { await Billing.buy(id); } catch (e) { toast(e.message); }
  }
  Billing.onGranted = (out, id) => { setPlayer(out); toast('Obrigado! +💎' + E.IAP[id].gems + ' 🎉'); if ($('s-shop').classList.contains('active')) renderShop(); };
  Billing.onError = (msg) => toast(msg);

  // =================================================================
  //                           PARTIDA
  // =================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let G = null;  // {s, runId, actions, speed, sel, selCell, prev, fx, sending}
  let cs = 40, dpr = 1;

  function resize() {
    const wrap = $('canvas-wrap');
    const w = wrap.clientWidth, h = wrap.clientHeight;
    cs = Math.floor(Math.min(w / Sim.COLS, h / Sim.ROWS));
    dpr = window.devicePixelRatio || 1;
    cv.style.width = cs * Sim.COLS + 'px'; cv.style.height = cs * Sim.ROWS + 'px';
    cv.width = cs * Sim.COLS * dpr; cv.height = cs * Sim.ROWS * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg = null;
  }
  window.addEventListener('resize', () => G && resize());

  async function startLevel(l, bonus) {
    const o = await act(API.start(l, bonus));
    if (!o.ok) {
      if (o.error === 'Sem energia') $('r-energy').click();
      return;
    }
    const s = Sim.createGame(o.cfg);
    G = { s, runId: o.runId, actions: [], speed: 1, sel: null, selCell: null, selSlot: null, selRock: null, prev: {}, proj: [], parts: [], ang: {}, recoil: {}, mon: {}, thit: {}, stunKind: {}, mshots: [], seen: {}, trans: null, acc: 0, last: performance.now(), sending: false };
    document.body.classList.add('ingame');
    document.querySelectorAll('.screen').forEach(x => x.classList.remove('active'));
    $('s-game').classList.add('active');
    $('g-speed').textContent = '1x';
    if (s.bonus) toast('🗝️ Fase secreta! Pegue os ladrões!');
    SND.music(Sim.worldInfo(l).theme, true);
    resize(); renderPanel(); requestAnimationFrame(loop);
  }

  function doAction(a) {
    a.t = G.s.tick;
    if (!Sim.applyAction(G.s, a)) return false;
    G.actions.push(a);
    const sn = { build: 'build', up: 'up', sell: 'sell', wave: 'wave', trap: 'build', repair: 'up', open: 'coin', relic: 'gems', secret: 'gems' }[a.a]; if (sn) SND.fx(sn);
    return true;
  }

  // ----- loop -----
  function loop(now) {
    if (!G) return;
    const dt = Math.min(250, now - G.last); G.last = now;
    const s = G.s;
    if (s.status === 'playing') {
      G.acc += dt * G.speed;
      const stepMs = 1000 / Sim.TPS;
      while (G.acc >= stepMs && s.status === 'playing') {
        G.acc -= stepMs;
        G.prev = {}; for (const e of s.enemies) G.prev[e.id] = [e.x, e.y];
        Sim.step(s);
        for (const e of s.enemies) if (!G.seen[e.id]) { G.seen[e.id] = 1; if (Sim.ENEMIES[e.type].boss) SND.fx('boss'); }
        for (const f of s.fx) fire(f);
        for (const ev of s.ev) onEvent(ev);
        if (G.sel && !s.towers.includes(G.sel)) { G.sel = null; renderPanel(); }
      }
    }
    draw(Math.min(1, G.acc / (1000 / Sim.TPS)));
    hud();
    if (s.status !== 'playing' && !G.sending) finish();
    requestAnimationFrame(loop);
  }

  let lastPanelGold = -1;
  function hud() {
    const s = G.s;
    $('g-lives').textContent = s.lives;
    $('g-gold').textContent = s.gold;
    $('g-wave-i').textContent = s.bonus ? '💰' : s.parts > 1 ? '🗺️' + (s.part + 1) + '/' + s.parts + ' 🌊' : '🌊';
    $('g-wave').textContent = s.bonus ? s.kills + '/' + (s.spawned + s.spawnQ.length + s.waves.slice(s.wave + 1).reduce((a, w) => a + w.list.length, 0)) : Math.max(0, s.wave + 1) + '/' + s.waves.length;
    const nb = $('g-next');
    nb.classList.toggle('hidden', s.phase !== 'build' || s.status !== 'playing');
    $('g-next-t').textContent = s.phase === 'build' ? Math.ceil(s.buildTimer / Sim.TPS) + 's' : '';
    if (s.gold !== lastPanelGold) { lastPanelGold = s.gold; updatePanelAfford(); }
  }

  // ----- desenho -----
  let bg = null;
  function hash(x, y, l) { let h = (x * 374761393 + y * 668265263 + l * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
  // ===== MAPAS SOMBRIOS (amb = efeito no ar: vagalumes, areia, névoa, neve, brasas, chuva...) =====
  const THEMES = [
    { ui: '#2b8a3e', g: ['#1f3a26', '#1b3322'], p: ['#120c08', '#3d2e1f', '#4f3d2a'], deco: ['🍄', '🕸️', '🌿', '🦉', '🕯️'], obst: ['🌲', '🪵', '🌳'], gate: '🌀', home: '🏰', pool: 'rgba(120,255,170,.10)', amb: 'vagalume', secret: '🍄', dark: .5 },
    { ui: '#e67700', g: ['#5c4a2a', '#544326'], p: ['#2b1d0e', '#7a5c33', '#8f6c3d'], deco: ['🦴', '🏺', '🌵', '💀', '🐍'], obst: ['🗿', '🏺', '🌵'], gate: '⚱️', home: '🏯', pool: 'rgba(0,0,0,.25)', amb: 'areia', secret: '🗿', dark: .45 },
    { ui: '#5c940d', g: ['#25322a', '#202c24'], p: ['#0f0a06', '#3a2e1e', '#463826'], deco: ['🦴', '🍄', '🕯️', '🪲', '💀'], obst: ['🌳', '🪵', '💀'], gate: '🕳️', home: '🛖', pool: 'rgba(130,201,30,.18)', amb: 'nevoa', secret: '🪷', dark: .55 },
    { ui: '#1c7ed6', g: ['#1c2f4a', '#192a42'], p: ['#0c1626', '#3a628a', '#4a76a3'], deco: ['❄️', '🧊', '✨'], obst: ['🏔️', '🧊', '🌲'], gate: '❄️', home: '🏰', pool: 'rgba(165,216,255,.18)', amb: 'neve', secret: '⛄', dark: .45 },
    { ui: '#c92a2a', g: ['#2b1a17', '#251614'], p: ['#100806', '#55261c', '#683024'], deco: ['🔥', '🪨', '💀'], obst: ['🌋', '🪨', '🔥'], gate: '🔥', home: '🏰', pool: 'rgba(255,90,40,.40)', amb: 'brasa', secret: '🪨', dark: .5 },
    { ui: '#1098ad', g: ['#3a3424', '#332d1f'], p: ['#20160c', '#5e4226', '#6f4f2e'], deco: ['🐚', '🦴', '🦀', '💀'], obst: ['🌴', '⚓', '💀'], gate: '🏴‍☠️', home: '🏰', pool: 'rgba(20,70,130,.5)', amb: 'nevoa', secret: '🐚', dark: .5 },
    { ui: '#495057', g: ['#1e241f', '#1a201b'], p: ['#0d0d0d', '#3d3d3d', '#4a4a4a'], deco: ['🕯️', '🦴', '🍂', '🕸️', '💀'], obst: ['🪦', '⚰️', '🌳'], gate: '🌫️', home: '⛪', pool: 'rgba(180,255,180,.10)', amb: 'nevoa', secret: '🪦', dark: .6 },
    { ui: '#9c36b5', g: ['#1d1a33', '#19172d'], p: ['#0e0c1c', '#4e45a0', '#6a60c0'], deco: ['💎', '✨', '🔮', '🕸️'], obst: ['💎', '🪨', '🔮'], gate: '🕳️', home: '🏰', pool: 'rgba(204,93,232,.25)', amb: 'brilho', secret: '💎', dark: .55 },
    { ui: '#364fc7', g: ['#2b3445', '#262e3d'], p: ['#10141c', '#3e4a5e', '#4c596e'], deco: ['☁️', '⚡', '🪶'], obst: ['☁️', '🏛️', '⚡'], gate: '🌀', home: '🏯', pool: 'rgba(80,100,140,.3)', amb: 'chuva', secret: '🌈', dark: .5 },
    { ui: '#a61e4d', g: ['#2a0f0c', '#240c0a'], p: ['#0c0302', '#5c1a10', '#7a2416'], deco: ['🔥', '💀', '🦴', '🕸️', '👁️'], obst: ['🌋', '💀', '🔥'], gate: '👹', home: '🏰', pool: 'rgba(255,80,20,.55)', amb: 'brasa', secret: '👁️', dark: .45 },
  ];
  const BONUS_THEME = { ui: '#7048e8', g: ['#3b3363', '#342d5a'], p: ['#1f1a3a', '#6b5ca5', '#8f7fd1'], deco: ['💎', '✨', '🪙', '💰'], obst: [], gate: '🕳️', home: '🚪' };
  const SECRET_ICON = ['🍄', '🗿', '🪷', '⛄', '🪨'];
  const themeOf = (s) => s.bonus ? BONUS_THEME : THEMES[Sim.worldInfo(s.level).theme];
  function buildBg() {
    const s = G.s, th = themeOf(s);
    bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const b = bg.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < Sim.ROWS; y++) for (let x = 0; x < Sim.COLS; x++) {
      b.fillStyle = th.g[(x + y) & 1]; b.fillRect(x * cs, y * cs, cs, cs);
      const h = hash(x, y, s.level + 7);
      b.fillStyle = 'rgba(0,0,0,.05)';
      for (let i = 0; i < 3; i++) b.fillRect(x * cs + ((h >> (i * 5)) % 28) / 28 * cs, y * cs + ((h >> (i * 5 + 3)) % 28) / 28 * cs, 3, 3);
    }
    // lava/água ao redor nos mundos especiais
    const pool = s.bonus ? null : Sim.worldInfo(s.level).theme === 4 ? 'rgba(255,90,40,.35)' : th.pool;
    if (pool) for (let i = 0; i < 6; i++) { const h = hash(i, 9, s.level); const x = h % Sim.COLS, y = (h >> 8) % Sim.ROWS; if (!s.blocked[x + ',' + y]) { b.fillStyle = pool; b.beginPath(); b.ellipse((x + .5) * cs, (y + .5) * cs, cs * .35, cs * .2, 0, 0, 7); b.fill(); } }
    // caminho
    b.lineCap = 'round'; b.lineJoin = 'round';
    const pts = s.pts.map(p => [p[0] / Sim.CELL * cs, p[1] / Sim.CELL * cs]);
    [[cs * 0.86, th.p[0]], [cs * 0.72, th.p[1]]].forEach(([w, c]) => {
      b.strokeStyle = c; b.lineWidth = w; b.beginPath(); pts.forEach((p, i) => i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1])); b.stroke();
    });
    b.setLineDash([cs * 0.1, cs * 0.25]); b.strokeStyle = th.p[2]; b.lineWidth = 2; b.beginPath(); pts.forEach((p, i) => i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1])); b.stroke(); b.setLineDash([]);
    // enfeites
    b.textAlign = 'center'; b.textBaseline = 'middle';
    for (let y = 0; y < Sim.ROWS; y++) for (let x = 0; x < Sim.COLS; x++) {
      if (s.blocked[x + ',' + y]) continue;
      const h = hash(x, y, s.level) % 100;
      if (h < 14) { b.fillStyle = '#000'; b.font = (cs * 0.3) + 'px sans-serif'; b.globalAlpha = .8; b.fillText(th.deco[h % th.deco.length], x * cs + cs * (0.25 + (h % 5) * 0.12), y * cs + cs * (0.3 + (h % 3) * 0.2)); b.globalAlpha = 1; }
    }
    // obstáculos
    for (const o of s.obst) {
      b.fillStyle = 'rgba(0,0,0,.2)'; b.beginPath(); b.ellipse((o.x + .5) * cs, (o.y + .8) * cs, cs * .36, cs * .12, 0, 0, 7); b.fill();
      b.fillStyle = '#000'; b.font = (cs * .78) + 'px sans-serif'; b.fillText(th.obst[o.v % th.obst.length], (o.x + .5) * cs, (o.y + .45) * cs);
    }
    // escuridão nas bordas (clima sombrio) + manchas de névoa
    if (!s.bonus) {
      const W2 = cs * Sim.COLS, H2 = cs * Sim.ROWS;
      for (let i = 0; i < 5; i++) { const h = hash(i, 3, s.level); b.fillStyle = 'rgba(200,200,220,.05)'; b.beginPath(); b.ellipse((h % 9) * cs, ((h >> 6) % 14) * cs, cs * 2.4, cs * 1.1, 0, 0, 7); b.fill(); }
      const vg = b.createRadialGradient(W2 / 2, H2 / 2, H2 * .2, W2 / 2, H2 / 2, H2 * .75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (th.dark || .5) + ')');
      b.fillStyle = vg; b.fillRect(0, 0, W2, H2);
    }
    // entrada e castelo
    const a = s.path[0], z = s.path[s.path.length - 1];
    b.font = (cs * 0.8) + 'px sans-serif'; b.fillStyle = '#000';
    b.fillText(th.gate, a[0] * cs + cs / 2, cs * 0.4);
    b.fillText(th.home, z[0] * cs + cs / 2, (Sim.ROWS - 1) * cs + cs * 0.55);
  }

  // ----- coisas interativas do mapa -----
  function drawMapStuff(s, now) {
    // trechos de armadilha
    for (const sl of s.slots) {
      const tr = s.traps.find(t => t.x === sl.x && t.y === sl.y && !t.used);
      const x = sl.x * cs, y = sl.y * cs;
      if (!tr) {
        const a = .45 + Math.sin(now * 4) * .25;
        ctx.save(); ctx.globalAlpha = a; ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 5, y + 5, cs - 10, cs - 10); ctx.restore();
        ctx.fillStyle = '#000'; ctx.font = (cs * .34) + 'px sans-serif'; ctx.globalAlpha = .9; ctx.fillText('⚠️', x + cs / 2, y + cs / 2); ctx.globalAlpha = 1;
        continue;
      }
      if (tr.k === 'espinhos') {
        ctx.fillStyle = '#495057';
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const px = x + cs * (.22 + i * .28), py = y + cs * (.3 + j * .25), up = (Math.sin(now * 6 + i + j) > 0 ? 1 : .6);
          ctx.beginPath(); ctx.moveTo(px - cs * .07, py + cs * .06); ctx.lineTo(px, py - cs * .12 * up); ctx.lineTo(px + cs * .07, py + cs * .06); ctx.fill();
        }
        ctx.fillStyle = '#ced4da'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + cs * (.22 + i * .28), y + cs * .25, 1.5, 0, 7); ctx.fill(); }
      } else if (tr.k === 'teia') {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.3;
        const cx = x + cs / 2, cy = y + cs / 2;
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * cs * .45, cy + Math.sin(a) * cs * .45); ctx.stroke(); }
        for (let rr = 1; rr <= 3; rr++) { ctx.beginPath(); for (let i = 0; i <= 8; i++) { const a = i * Math.PI / 4, R = cs * .14 * rr; i ? ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R) : ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } ctx.stroke(); }
      } else if (tr.k === 'bomba') {
        const cx = x + cs / 2, cy = y + cs * .55, pulse = 1 + Math.sin(now * 8) * .06;
        ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.arc(cx, cy, cs * .22 * pulse, 0, 7); ctx.fill();
        ctx.fillStyle = '#868e96'; ctx.beginPath(); ctx.arc(cx - cs * .07, cy - cs * .07, cs * .06, 0, 7); ctx.fill();
        ctx.strokeStyle = '#a07040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + cs * .1, cy - cs * .18); ctx.quadraticCurveTo(cx + cs * .22, cy - cs * .36, cx + cs * .3, cy - cs * .28); ctx.stroke();
        ctx.fillStyle = Math.sin(now * 20) > 0 ? '#ffd43b' : '#ff6b6b'; ctx.beginPath(); ctx.arc(cx + cs * .3, cy - cs * .28, 3.5, 0, 7); ctx.fill();
      }
    }
    // tesouros
    for (const t of s.treas) {
      const cx = (t.x + .5) * cs, cy = (t.y + .5) * cs, bob = Math.sin(now * 3 + t.x) * 2;
      if (t.k === 'bau') {
        if (t.open) { ctx.globalAlpha = .55; drawChest(cx, cy, true); ctx.globalAlpha = 1; continue; }
        drawChest(cx, cy + bob, false);
        sparkle(cx + cs * .3, cy - cs * .25, now, '#fff3bf');
      } else {
        if (t.open) { ctx.fillStyle = '#868e96'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx - cs * .2 + i * cs * .13, cy + cs * .2 - (i % 2) * cs * .06, cs * .07, 0, 7); ctx.fill(); } continue; }
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(cx, cy + cs * .3, cs * .34, cs * .1, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#868e96'; ctx.beginPath(); ctx.moveTo(cx - cs * .36, cy + cs * .28); ctx.lineTo(cx - cs * .26, cy - cs * .14); ctx.lineTo(cx, cy - cs * .3); ctx.lineTo(cx + cs * .3, cy - cs * .12); ctx.lineTo(cx + cs * .36, cy + cs * .28); ctx.fill();
        ctx.fillStyle = '#adb5bd'; ctx.beginPath(); ctx.moveTo(cx - cs * .26, cy - cs * .14); ctx.lineTo(cx, cy - cs * .3); ctx.lineTo(cx + cs * .05, cy); ctx.lineTo(cx - cs * .2, cy + cs * .08); ctx.fill();
        ctx.fillStyle = '#f783ac'; ctx.beginPath(); ctx.moveTo(cx + cs * .12, cy - cs * .08); ctx.lineTo(cx + cs * .2, cy + cs * .04); ctx.lineTo(cx + cs * .12, cy + cs * .16); ctx.lineTo(cx + cs * .04, cy + cs * .04); ctx.fill();
        ctx.fillStyle = '#66d9e8'; ctx.beginPath(); ctx.arc(cx - cs * .12, cy + cs * .14, cs * .05, 0, 7); ctx.fill();
        sparkle(cx + cs * .16, cy - cs * .02, now + 1, '#fff');
        ctx.font = 'bold ' + (cs * .2) + 'px sans-serif'; ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#0009'; ctx.lineWidth = 3;
        ctx.strokeText('🪙' + Sim.GEM_ROCK_COST, cx, cy - cs * .42); ctx.fillText('🪙' + Sim.GEM_ROCK_COST, cx, cy - cs * .42);
      }
    }
    // relíquia da ARMA SECRETA
    if (s.relic && !s.part) {
      const cx = (s.relic.x + .5) * cs, cy = (s.relic.y + .5) * cs;
      ctx.fillStyle = '#343a40'; ctx.fillRect(cx - cs * .3, cy, cs * .6, cs * .3); ctx.fillStyle = '#495057'; ctx.fillRect(cx - cs * .36, cy + cs * .25, cs * .72, cs * .12);
      if (!s.relic.found) {
        ctx.globalAlpha = .35 + Math.abs(Math.sin(now * 2)) * .4; ctx.fillStyle = '#c92a2a'; ctx.beginPath(); ctx.arc(cx, cy - cs * .05, cs * .32, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#000'; ctx.font = (cs * .42) + 'px sans-serif'; ctx.fillText('🗡️', cx, cy - cs * .08);
      } else { ctx.fillStyle = '#000'; ctx.font = (cs * .42) + 'px sans-serif'; ctx.fillText('✨', cx, cy - cs * .08); }
    }
    // lugar misterioso
    if (s.secret) {
      const cx = (s.secret.x + .5) * cs, cy = (s.secret.y + .5) * cs;
      if (!s.secret.found) {
        ctx.font = (cs * .6) + 'px sans-serif'; ctx.fillStyle = '#000';
        ctx.fillText(themeOf(s).secret || SECRET_ICON[Sim.worldInfo(s.level).theme], cx, cy);
        if ((now % 3) < 1) sparkle(cx + cs * .2, cy - cs * .25, now * 2, '#d0bfff');       // brilho discreto de vez em quando
      } else {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(now * 2);
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, cs * .45); g.addColorStop(0, '#fff'); g.addColorStop(.4, '#9775fa'); g.addColorStop(1, 'rgba(112,72,232,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, cs * .45, 0, 7); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#000'; ctx.font = (cs * .4) + 'px sans-serif'; ctx.fillText('🗝️', cx, cy + Math.sin(now * 3) * 3);
      }
    }
  }
  // clima do mapa (vagalumes, areia, névoa, neve, brasas, brilho, chuva)
  function drawAmbient(s, now) {
    const th = themeOf(s), W2 = cs * Sim.COLS, H2 = cs * Sim.ROWS;
    if (!th.amb) return;
    const A = G.amb || (G.amb = []);
    const want = th.amb === 'chuva' ? 60 : th.amb === 'nevoa' ? 10 : 34;
    while (A.length < want) A.push({ x: Math.random() * W2, y: Math.random() * H2, p: Math.random() * 6.28, s: .5 + Math.random() });
    for (const q of A) {
      if (th.amb === 'vagalume') { q.x += Math.cos(now + q.p) * .3; q.y += Math.sin(now * .7 + q.p) * .3; ctx.globalAlpha = .4 + Math.sin(now * 3 + q.p) * .4; ctx.fillStyle = '#d8f5a2'; ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, 7); ctx.fill(); }
      else if (th.amb === 'areia') { q.x += 1.4 * q.s; q.y += Math.sin(now + q.p) * .3; ctx.globalAlpha = .35; ctx.fillStyle = '#e9c46a'; ctx.fillRect(q.x, q.y, 2, 1); }
      else if (th.amb === 'nevoa') { q.x += .25 * q.s; ctx.globalAlpha = .07; ctx.fillStyle = '#dee2e6'; ctx.beginPath(); ctx.ellipse(q.x, q.y, cs * 1.8, cs * .7, 0, 0, 7); ctx.fill(); }
      else if (th.amb === 'neve') { q.y += .7 * q.s; q.x += Math.sin(now + q.p) * .4; ctx.globalAlpha = .8; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, 1.6 * q.s, 0, 7); ctx.fill(); }
      else if (th.amb === 'brasa') { q.y -= .8 * q.s; q.x += Math.sin(now * 2 + q.p) * .5; ctx.globalAlpha = .5 + Math.sin(now * 5 + q.p) * .4; ctx.fillStyle = q.s > 1 ? '#ffd43b' : '#ff6b00'; ctx.beginPath(); ctx.arc(q.x, q.y, 1.8, 0, 7); ctx.fill(); }
      else if (th.amb === 'brilho') { ctx.globalAlpha = Math.max(0, Math.sin(now * 2 + q.p)) * .8; ctx.fillStyle = '#e5dbff'; ctx.beginPath(); ctx.arc(q.x, q.y, 1.8, 0, 7); ctx.fill(); }
      else if (th.amb === 'chuva') { q.y += 7 * q.s; q.x -= 1.5; ctx.globalAlpha = .35; ctx.strokeStyle = '#a5d8ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + 3, q.y - 9); ctx.stroke(); }
      if (q.x > W2 + 40) q.x = -40; if (q.x < -40) q.x = W2 + 40; if (q.y > H2 + 20) q.y = -20; if (q.y < -20) q.y = H2 + 20;
    }
    ctx.globalAlpha = 1;
    if (th.amb === 'chuva' && Math.random() < .004) G.flash = 6;                 // relâmpago
    if (G.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + G.flash / 20 + ')'; ctx.fillRect(0, 0, W2, H2); G.flash--; }
  }
  function drawChest(cx, cy, open) {
    const w = cs * .6, h = cs * .38;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(cx, cy + h * .7, w * .55, cs * .08, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8d5524'; ctx.fillRect(cx - w / 2, cy - h * .2, w, h * .8);
    if (open) { ctx.fillStyle = '#5c3a14'; ctx.fillRect(cx - w / 2, cy - h * .9, w, h * .7); return; }
    ctx.fillStyle = '#a0632c'; ctx.beginPath(); ctx.ellipse(cx, cy - h * .2, w / 2, h * .45, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ffd43b'; ctx.fillRect(cx - w / 2, cy - h * .25, w, h * .12); ctx.fillRect(cx - cs * .05, cy - h * .3, cs * .1, h * .4);
  }
  function sparkle(x, y, t, c) {
    const s = 3 + Math.abs(Math.sin(t * 3)) * 4;
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * .3, y - s * .3); ctx.lineTo(x + s, y); ctx.lineTo(x + s * .3, y + s * .3); ctx.lineTo(x, y + s); ctx.lineTo(x - s * .3, y + s * .3); ctx.lineTo(x - s, y); ctx.lineTo(x - s * .3, y - s * .3); ctx.fill();
  }

  function draw(alpha) {
    const s = G.s;
    if (!bg) buildBg();
    const sh = G.shake > 0 ? (G.shake--, (Math.random() - .5) * G.shake) : 0;
    const ty = G.trans ? (1 - Math.min(1, (G.trans.t * G.trans.t * (3 - 2 * G.trans.t)))) * cs * Sim.ROWS : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bg, sh * dpr, (sh + ty) * dpr); ctx.setTransform(dpr, 0, 0, dpr, sh * dpr, (sh + ty) * dpr);
    const k = cs / Sim.CELL;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // célula selecionada
    if (G.selCell) {
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.fillRect(G.selCell[0] * cs + 2, G.selCell[1] * cs + 2, cs - 4, cs - 4); ctx.strokeRect(G.selCell[0] * cs + 2, G.selCell[1] * cs + 2, cs - 4, cs - 4);
    }
    // alcance da torre selecionada
    if (G.sel) {
      const st = Sim.towerStats(s, G.sel);
      ctx.beginPath(); ctx.arc((G.sel.x + .5) * cs, (G.sel.y + .5) * cs, st.range * k, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
    const now = performance.now() / 1000;
    drawMapStuff(s, now);
    drawZones(s, now);
    drawAmbient(s, now);
    if (G.selSlot || G.selRock) { const c = G.selSlot || G.selRock; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(c[0] * cs + 2, c[1] * cs + 2, cs - 4, cs - 4); }
    // torres (base fixa + arma que gira e mira)
    for (const tw of s.towers) drawTower(s, tw, k);
    // monstrinhos (os de baixo na frente; voadores por cima)
    const list = s.enemies.filter(e => e.d > 0).sort((a, b) => (Sim.ENEMIES[a.type].fly ? 1 : 0) - (Sim.ENEMIES[b.type].fly ? 1 : 0) || a.y - b.y);
    for (const e of list) {
      const pv = G.prev[e.id] || [e.x, e.y];
      const x = (pv[0] + (e.x - pv[0]) * alpha) * k, y = (pv[1] + (e.y - pv[1]) * alpha) * k;
      const D = Sim.ENEMIES[e.type];
      const m = G.mon[e.id] || (G.mon[e.id] = { face: 1, hp: e.hp + (e.shield || 0), hitT: 0 });
      const ddx = e.x - pv[0], ddy = e.y - pv[1];
      if (ddx || ddy) {                                   // gira suave para a direção em que anda
        const want = Math.atan2(ddy, ddx);
        if (m.ang == null) m.ang = want;
        let d = want - m.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        m.ang += d * .3;
      } else if (m.ang == null) m.ang = Math.PI / 2;
      const tot = e.hp + (e.shield || 0);
      if (tot < m.hp) m.hitT = 4; m.hp = tot;
      const dash = D.dash && e.pt % 70 < 14;
      Monsters.draw(ctx, e, x, y, D.r * k * 1.55, { atk: m.atkT > 0 ? m.atkT-- / 10 : 0, angle: m.ang, walk: (e.d10 || 0) / 10 * .09 + e.id, hitT: m.hitT--, tier: s.tier, t: now, dash });
    }
    drawProjectiles(k, alpha);
    drawMonsterShots(now);
    if (G.trans) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawTransition(); }
    // mensagem da 1ª onda
    if (s.wave < 0 && !s.towers.length) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; round(cs * .5, cs * 5.6, cs * 8, cs * 1.6, 12, 'rgba(0,0,0,.55)');
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (cs * .36) + 'px sans-serif';
      ctx.fillText(s.bonus ? 'Ladrões vindo! Construa torres rápido!' : 'Toque num espaço livre para construir', cs * 4.5, cs * 6.2);
      ctx.font = (cs * .3) + 'px sans-serif'; ctx.fillText(s.bonus ? 'Cada ladrão derrotado = moedas 🪙' : '⚠️ no caminho = armadilha · 🎁 = tesouro', cs * 4.5, cs * 6.75);
    }
  }
  // ================= ANIMAÇÃO DAS ARMAS =================
  const PROJ = { arqueiro: 5, gelo: 6, canhao: 11, lanceiro: 6, mago: 4, dragao: 6, raio: 4, raioceu: 6, feixe: 2, veneno: 9, vento: 10, agua: 9, corte: 4, onda: 9, meteoro: 14, feixeolho: 3 };
  // qual animação de tiro cada arma usa
  const STYLE = { foice: 'corte', espada: 'corte', sino: 'onda', meteoro: 'meteoro', olho: 'feixeolho', besta: 'arqueiro', arqueiraouro: 'arqueiro', balista: 'lanceiro', canhaoouro: 'canhao', tesla: 'raio', zeus: 'raioceu', solar: 'feixe', veneno: 'veneno', furacao: 'vento', poseidon: 'agua' };
  const GOLD = { arqueiraouro: 1, canhaoouro: 1 };   // duração do voo (frames)
  function fire(f) {
    G.recoil[f.tw] = 1;
    G.ang[f.tw] = Math.atan2(f.y2 - f.y1, f.x2 - f.x1);
    const sk = T[f.k] ? T[f.k].style : f.k, st = STYLE[sk] || sk;
    SND.shot(st);
    G.proj.push({ k: st, tk: sk, col: T[f.k] && T[f.k].color, gold: GOLD[sk] || (T[f.k] && T[f.k].rar === 'dourada'), e: f.e, x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, splash: f.splash, t: 0, dur: PROJ[st] });
  }
  const SND_EV = { die: 'die', matk: 'matk', tdie: 'tdie', boom: 'boom', spike: 'spike', revive: 'revive', summon: 'summon', part: 'part' };
  function onEvent(ev) {
    const k = cs / Sim.CELL, x = ev.x * k, y = ev.y * k;
    const burst = (n, c, v, life, r) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = v * (.4 + Math.random()); G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life, max: life, c, r: r * cs }); } };
    if (SND_EV[ev.k]) SND.fx(ev.k === 'die' && Sim.ENEMIES[ev.type].boss ? 'bossDie' : SND_EV[ev.k]);
    if (ev.k === 'die') {
      const D = Sim.ENEMIES[ev.type];
      burst(10, D.color, 2.2, 16, .06); burst(5, '#fff', 1.5, 12, .04);
      G.parts.push({ x, y: y - cs * .3, vx: 0, vy: -.8, life: 30, max: 30, txt: '+' + D.gold, c: '#ffd43b' });
      delete G.mon[ev.id];
    } else if (ev.k === 'heal') {
      G.parts.push({ x, y, vx: 0, vy: 0, life: 20, max: 20, c: '#69db7c', ring: 220 * k });
      for (let i = 0; i < 5; i++) G.parts.push({ x: x + (Math.random() - .5) * cs, y, vx: 0, vy: -1, life: 24, max: 24, txt: '+', c: '#51cf66' });
    } else if (ev.k === 'knock') {
      const m = G.mon[ev.id]; if (m) m.hitT = 4;
    } else if (ev.k === 'matk') {
      G.mshots.push({ kind: ev.kind, dmg: ev.dmg, tw: ev.tw, x1: x, y1: y - cs * .3, x2: ev.x2 * k, y2: ev.y2 * k, t: 0 });
      const mm = G.mon[ev.id]; if (mm) mm.atkT = 10;
      G.stunKind[ev.tw] = ev.kind === 'maldicao' || ev.kind === 'tinta' || ev.kind === 'teia' || ev.kind === 'raio' ? 'maldicao' : 'gelo';
    } else if (ev.k === 'tdie') {
      const tx = (ev.x + .5) * cs, ty = (ev.y + .5) * cs;
      for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; G.parts.push({ x: tx, y: ty, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 - 2, g: .15, life: 30, max: 30, c: ['#7d6e9e', '#9d8fc4', '#495057'][i % 3], r: cs * .07 }); }
      G.parts.push({ x: tx, y: ty - cs * .3, vx: 0, vy: -.6, life: 40, max: 40, txt: 'DESTRUÍDA!', c: '#ff6b6b' });
      G.shake = 8; toast('💥 Sua torre ' + T[ev.type].name + ' foi destruída!');
      if (G.sel && G.sel.id === ev.id) { G.sel = null; renderPanel(); }
    } else if (ev.k === 'part') {
      startTransition(ev);
    } else if (ev.k === 'boom') {
      burst(26, '#ff922b', 4, 22, .09); burst(14, '#495057', 2.5, 26, .08);
      G.parts.push({ x, y, vx: 0, vy: 0, life: 16, max: 16, c: '#ffd43b', ring: 140 * k });
      G.shake = 10;
    } else if (ev.k === 'spike') {
      const sx = (ev.x + .5) * cs, sy = (ev.y + .5) * cs;
      for (let i = 0; i < 2; i++) G.parts.push({ x: sx + (Math.random() - .5) * cs * .6, y: sy, vx: 0, vy: -1.2, life: 10, max: 10, c: '#fa5252', r: cs * .03 });
    } else if (ev.k === 'dig' || ev.k === 'rise') {
      burst(10, '#a07040', 2, 16, .05);
    } else if (ev.k === 'jump') {
      burst(8, '#ced4da', 1.8, 14, .05);
    } else if (ev.k === 'revive') {
      G.parts.push({ x, y, vx: 0, vy: 0, life: 22, max: 22, c: '#fff3bf', ring: cs * .9 });
      G.parts.push({ x, y: y - cs * .4, vx: 0, vy: -.7, life: 30, max: 30, txt: 'REVIVEU!', c: '#ffe066' });
      burst(12, '#ffe066', 2, 18, .05);
    } else if (ev.k === 'summon') {
      burst(16, '#9775fa', 2.5, 18, .07);
      G.parts.push({ x, y, vx: 0, vy: 0, life: 18, max: 18, c: '#d0bfff', ring: cs * 1.2 });
    }
  }
  function startTransition(ev) {
    const snap = document.createElement('canvas'); snap.width = cv.width; snap.height = cv.height;
    snap.getContext('2d').drawImage(cv, 0, 0);
    G.trans = { img: snap, t: 0 };
    bg = null; G.amb = null; G.ang = {}; G.proj = []; G.mshots = []; G.sel = null; G.selCell = null; G.selSlot = null; G.selRock = null;
    renderPanel();
    toast(`🗺️ Parte ${ev.part + 1}/${G.s.parts}: o caminho continua! (+${ev.refund} ouro das torres)`);
  }
  function drawTransition() {
    const t = G.trans; t.t += 1 / 45;
    const p = Math.min(1, t.t), e = p * p * (3 - 2 * p), H = cs * Sim.ROWS;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(t.img, 0, -e * H * dpr);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.5 * (1 - Math.abs(p - .5) * 2)) + ')'; ctx.fillRect(0, 0, cs * Sim.COLS, H);
    if (p < 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (cs * .5) + 'px sans-serif'; ctx.fillText('Parte ' + (G.s.part + 1) + ' de ' + G.s.parts, cs * 4.5, H / 2); }
    if (p >= 1) G.trans = null;
  }
  function enemyPos(id, k, alpha) {
    const e = G.s.enemies.find(o => o.id === id);
    if (!e) return null;
    const pv = G.prev[e.id] || [e.x, e.y];
    const lift = Sim.ENEMIES[e.type].fly ? Sim.ENEMIES[e.type].r * 1.0 : 0;
    return [pv[0] + (e.x - pv[0]) * alpha, pv[1] + (e.y - pv[1]) * alpha - lift];
  }
  function aim(s, tw) {
    const st = Sim.towerStats(s, tw), cx = tw.x * 100 + 50, cy = tw.y * 100 + 50;
    let best = null;
    for (const e of s.enemies) {
      if (e.d <= 0) continue;
      const dx = e.x - cx, dy = e.y - cy;
      if (dx * dx + dy * dy <= st.range * st.range && (!best || e.d > best.d)) best = e;
    }
    let cur = G.ang[tw.id] == null ? Math.PI / 2 : G.ang[tw.id];
    if (best) {
      const want = Math.atan2(best.y - cy, best.x - cx);
      let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      cur += d * 0.35;
    } else cur += 0.012;                                  // vigiando
    G.ang[tw.id] = cur;
    return cur;
  }
  function drawTower(s, tw, k) {
    const cx = (tw.x + .5) * cs, cy = (tw.y + .5) * cs, t = T[tw.type], now = performance.now() / 1000;
    const ang = aim(s, tw);
    const rc = G.recoil[tw.id] || 0; G.recoil[tw.id] = rc * 0.82;
    // sombra + base de pedra
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + cs * .32, cs * .4, cs * .12, 0, 0, 7); ctx.fill();
    round(cx - cs * .4, cy - cs * .3, cs * .8, cs * .66, cs * .16, '#6b5d8c');
    round(cx - cs * .36, cy - cs * .36, cs * .72, cs * .6, cs * .14, '#9d8fc4');
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(cx, cy - cs * .06, cs * .27, 0, 7); ctx.fill();
    ctx.strokeStyle = Sim.RARITIES[t.rar].color; ctx.lineWidth = t.rar === 'comum' ? 2 : 3.5; ctx.stroke();
    if (t.rar === 'divina' || t.rar === 'dourada') { ctx.globalAlpha = .25 + Math.sin(now * 3) * .15; ctx.fillStyle = t.rar === 'divina' ? '#fff' : '#ffd43b'; ctx.beginPath(); ctx.arc(cx, cy - cs * .06, cs * .48, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    for (let i = 0; i < tw.lvl; i++) { ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(cx - cs * .14 + i * cs * .14, cy + cs * .2, cs * .05, 0, 7); ctx.fill(); }
    // vida da torre e efeitos de congelada/amaldiçoada
    const mhp = Sim.towerMaxHp(tw);
    {
      const bw = cs * .78, bx0 = cx - bw / 2, by0 = cy - cs * .56, fr = Math.max(0, tw.hp / mhp);
      ctx.fillStyle = '#000b'; ctx.fillRect(bx0 - 1, by0 - 1, bw + 2, 7);
      ctx.fillStyle = fr > .5 ? '#51cf66' : fr > .25 ? '#ffa94d' : '#fa5252'; ctx.fillRect(bx0, by0, bw * fr, 5);
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (cs * .17) + 'px sans-serif'; ctx.fillText('❤', bx0 - cs * .06, by0 + 2.5);
      if (fr < .35 && Math.sin(now * 10) > 0) { ctx.strokeStyle = '#fa5252'; ctx.lineWidth = 2; ctx.strokeRect(cx - cs * .44, cy - cs * .44, cs * .88, cs * .84); }
      if (tw.hp / mhp < .5 && Math.random() < .08) G.parts.push({ x: cx + (Math.random() - .5) * cs * .4, y: cy - cs * .2, vx: 0, vy: -.6, life: 30, max: 30, c: 'rgba(80,80,80,.6)', r: cs * .06 });
    }
    const hitT = G.thit[tw.id] || 0; if (hitT > 0) G.thit[tw.id] = hitT - 1;
    // arma girando
    const u = cs / 100, bob = Math.sin(now * 3 + tw.id) * 2 * u;
    ctx.save(); ctx.translate(cx, cy - cs * .06 + (t.style === 'mago' ? bob : 0)); ctx.rotate(ang);
    ctx.scale(1.35, 1.35); ctx.translate(-rc * 8 * u, 0);   // recuo do tiro
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ty = t.style || tw.type, gold = GOLD[ty] || t.rar === 'dourada';
    if (ty === 'foice') {                                    // foice girando
      ctx.save(); ctx.rotate(Math.sin(now * 3) * .4 + rc * 1.5);
      ctx.strokeStyle = '#5c3a14'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.moveTo(-16 * u, 0); ctx.lineTo(22 * u, 0); ctx.stroke();
      ctx.fillStyle = t.color === '#000000' ? '#495057' : '#ced4da'; ctx.beginPath(); ctx.moveTo(20 * u, -2 * u); ctx.quadraticCurveTo(28 * u, -22 * u, 6 * u, -26 * u); ctx.quadraticCurveTo(20 * u, -16 * u, 16 * u, -2 * u); ctx.fill();
      ctx.restore();
    } else if (ty === 'sino') {                              // sino balançando
      ctx.save(); ctx.rotate(Math.sin(now * 2 + tw.id) * .3 + rc * .8);
      ctx.fillStyle = gold || t.rar === 'divina' ? '#ffd43b' : '#e9c46a'; ctx.beginPath(); ctx.moveTo(-14 * u, 14 * u); ctx.quadraticCurveTo(-14 * u, -16 * u, 0, -18 * u); ctx.quadraticCurveTo(14 * u, -16 * u, 14 * u, 14 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7c4a1e'; ctx.beginPath(); ctx.arc(0, 16 * u, 4 * u, 0, 7); ctx.fill(); ctx.restore();
      if (rc > .3) { ctx.strokeStyle = 'rgba(255,212,59,' + rc + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, (30 - rc * 10) * u, 0, 7); ctx.stroke(); }
    } else if (ty === 'meteoro') {                           // catapulta / lançador
      ctx.fillStyle = '#5c3a14'; ctx.fillRect(-14 * u, -8 * u, 24 * u, 16 * u);
      ctx.save(); ctx.rotate(-rc * 1.2); ctx.strokeStyle = '#7c4a1e'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.moveTo(-6 * u, 0); ctx.lineTo(24 * u, 0); ctx.stroke();
      if (rc < .4) { ctx.fillStyle = t.zone ? '#ff922b' : '#868e96'; ctx.beginPath(); ctx.arc(24 * u, 0, 7 * u, 0, 7); ctx.fill(); }
      ctx.restore();
    } else if (ty === 'olho') {                              // olho que tudo vê
      ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.ellipse(0, 0, 20 * u, 12 * u, 0, 0, 7); ctx.fill();
      const g2 = ctx.createRadialGradient(6 * u, 0, 1, 6 * u, 0, 9 * u); g2.addColorStop(0, '#fff'); g2.addColorStop(.3, t.color); g2.addColorStop(1, '#000');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(6 * u, 0, 9 * u, 0, 7); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(7 * u, 0, 2.5 * u, 6 * u, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c92a2a'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-18 * u, (i - 1.5) * 5 * u); ctx.lineTo(-8 * u, (i - 1.5) * 3 * u); ctx.stroke(); }
    } else if (ty === 'espada') {                            // espada brilhante
      ctx.save(); ctx.rotate(rc * 1.2 - .3);
      ctx.fillStyle = t.color; ctx.beginPath(); ctx.moveTo(-6 * u, -3 * u); ctx.lineTo(30 * u, -2 * u); ctx.lineTo(36 * u, 0); ctx.lineTo(30 * u, 2 * u); ctx.lineTo(-6 * u, 3 * u); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.globalAlpha = .6; ctx.fillRect(0, -1 * u, 28 * u, 1.2 * u); ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd43b'; ctx.fillRect(-8 * u, -9 * u, 4 * u, 18 * u); ctx.fillStyle = '#5c3a14'; ctx.fillRect(-16 * u, -2 * u, 8 * u, 4 * u);
      ctx.restore();
    } else
    if (ty === 'veneno') {                                   // caldeirão borbulhando
      ctx.fillStyle = '#343a40'; ctx.beginPath(); ctx.arc(0, 0, 20 * u, 0, 7); ctx.fill();
      ctx.fillStyle = '#82c91e'; ctx.beginPath(); ctx.arc(0, 0, 15 * u, 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = now * 2 + i * 1.6, r2 = (3 + Math.abs(Math.sin(now * 4 + i)) * 4) * u; ctx.fillStyle = '#d8f5a2'; ctx.beginPath(); ctx.arc(Math.cos(a) * 8 * u, Math.sin(a) * 8 * u, r2, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#000'; ctx.font = (14 * u) + 'px sans-serif'; ctx.fillText('☠️', 0, 0);
    } else if (ty === 'tesla') {                             // bobina elétrica
      for (let i = 3; i >= 1; i--) { ctx.strokeStyle = i % 2 ? '#adb5bd' : '#495057'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(0, 0, i * 7 * u, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#74c0fc'; ctx.beginPath(); ctx.arc(0, 0, 6 * u + rc * 6 * u, 0, 7); ctx.fill();
      if (Math.random() < .5) { ctx.strokeStyle = '#e7f5ff'; ctx.lineWidth = 1.5; ctx.beginPath(); let a = Math.random() * 6.28, x = 0, y = 0; ctx.moveTo(0, 0); for (let i = 0; i < 4; i++) { x += Math.cos(a) * 6 * u; y += Math.sin(a) * 6 * u; a += (Math.random() - .5) * 1.5; ctx.lineTo(x, y); } ctx.stroke(); }
    } else if (ty === 'solar') {                             // sol girando
      ctx.save(); ctx.rotate(now * 1.5);
      for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.fillStyle = i % 2 ? '#ffd43b' : '#ff922b'; ctx.beginPath(); ctx.moveTo(14 * u, -4 * u); ctx.lineTo(28 * u, 0); ctx.lineTo(14 * u, 4 * u); ctx.fill(); }
      ctx.restore();
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16 * u); g.addColorStop(0, '#fff'); g.addColorStop(.5, '#ffe066'); g.addColorStop(1, '#ff922b');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16 * u, 0, 7); ctx.fill();
    } else if (ty === 'furacao') {                           // redemoinho
      ctx.save(); ctx.rotate(-now * 8);
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.strokeStyle = i % 2 ? '#e3fafc' : '#99e9f2'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(6 * u, 0, 12 * u, -1, 1.6); ctx.stroke(); }
      ctx.restore();
    } else if (ty === 'zeus') {                              // nuvem com raio
      for (const [x, y, r] of [[-10, 2, 11], [0, -6, 13], [11, 1, 11], [0, 6, 10]]) { ctx.fillStyle = '#ced4da'; ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, 7); ctx.fill(); }
      for (const [x, y, r] of [[-9, 0, 8], [0, -6, 10], [10, 0, 8]]) { ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.arc(x * u, y * u, r * u, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.moveTo(2 * u, 2 * u); ctx.lineTo(-4 * u, 14 * u); ctx.lineTo(1 * u, 13 * u); ctx.lineTo(-3 * u, 24 * u); ctx.lineTo(8 * u, 9 * u); ctx.lineTo(3 * u, 10 * u); ctx.lineTo(7 * u, 2 * u); ctx.fill();
    } else if (ty === 'poseidon') {                          // tridente azul
      ctx.strokeStyle = '#1971c2'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.moveTo(-14 * u + rc * 10 * u, 0); ctx.lineTo(26 * u + rc * 10 * u, 0); ctx.stroke();
      ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3 * u; const tx = 26 * u + rc * 10 * u;
      ctx.beginPath(); ctx.moveTo(tx, -9 * u); ctx.lineTo(tx, 9 * u); ctx.moveTo(tx, -9 * u); ctx.lineTo(tx + 10 * u, -9 * u); ctx.moveTo(tx, 0); ctx.lineTo(tx + 12 * u, 0); ctx.moveTo(tx, 9 * u); ctx.lineTo(tx + 10 * u, 9 * u); ctx.stroke();
      ctx.fillStyle = 'rgba(59,201,219,.5)'; ctx.beginPath(); ctx.arc(0, 0, (10 + Math.sin(now * 4) * 2) * u, 0, 7); ctx.fill();
    } else if (ty === 'balista') {                           // balista: arco enorme + virote
      ctx.strokeStyle = '#5c3a14'; ctx.lineWidth = 6 * u; ctx.beginPath(); ctx.arc(4 * u, 0, 26 * u, -1.25, 1.25); ctx.stroke();
      ctx.fillStyle = '#7c4a1e'; ctx.fillRect(-14 * u, -4 * u, 30 * u, 8 * u);
      if (rc < .5) { ctx.strokeStyle = '#495057'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.moveTo(-10 * u, 0); ctx.lineTo(34 * u, 0); ctx.stroke(); ctx.fillStyle = '#dee2e6'; ctx.beginPath(); ctx.moveTo(42 * u, 0); ctx.lineTo(32 * u, -6 * u); ctx.lineTo(32 * u, 6 * u); ctx.fill(); }
    } else if (ty === 'arqueiro' || ty === 'besta' || ty === 'arqueiraouro') {
      const pull = (1 - rc) * 10 * u, wood = gold ? '#e67700' : ty === 'besta' ? '#5c940d' : '#7c4a1e';
      if (ty === 'besta') { ctx.fillStyle = '#5c3a14'; ctx.fillRect(-12 * u, -3 * u, 30 * u, 6 * u); }
      const bows = ty === 'arqueiro' ? [0] : [-7, 7];
      for (const off of bows) {
        ctx.save(); ctx.translate(0, off * u);
        ctx.strokeStyle = wood; ctx.lineWidth = 5 * u;
        ctx.beginPath(); ctx.arc(-4 * u, 0, 22 * u, -1.15, 1.15); ctx.stroke();
        const ex = -4 * u + Math.cos(1.15) * 22 * u, ey = Math.sin(1.15) * 22 * u;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u;
        ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(-pull, 0); ctx.lineTo(ex, ey); ctx.stroke();
        if (rc < .5) { ctx.strokeStyle = '#5c3a14'; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(-pull, 0); ctx.lineTo(24 * u, 0); ctx.stroke();
          ctx.fillStyle = gold ? '#ffd43b' : '#ced4da'; ctx.beginPath(); ctx.moveTo(30 * u, 0); ctx.lineTo(22 * u, -5 * u); ctx.lineTo(22 * u, 5 * u); ctx.fill(); }
        ctx.restore();
      }
    } else if (ty === 'lanceiro') {
      const thrust = rc * 14 * u;
      ctx.fillStyle = '#c08a3e'; ctx.beginPath(); ctx.arc(-6 * u, 0, 11 * u, 0, 7); ctx.fill();      // escudo
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(-6 * u, 0, 7 * u, 0, 7); ctx.fill();
      if (rc < .45) {                                          // lança pronta na mão
        ctx.strokeStyle = '#7c4a1e'; ctx.lineWidth = 3.5 * u; ctx.beginPath(); ctx.moveTo(-14 * u + thrust, 6 * u); ctx.lineTo(30 * u + thrust, 6 * u); ctx.stroke();
        ctx.fillStyle = '#dee2e6'; ctx.beginPath(); ctx.moveTo(40 * u + thrust, 6 * u); ctx.lineTo(28 * u + thrust, 1 * u); ctx.lineTo(28 * u + thrust, 11 * u); ctx.fill();
      }
    } else if (ty === 'canhao' || ty === 'canhaoouro') {
      ctx.fillStyle = gold ? '#e67700' : '#343a40'; ctx.fillRect(0, -9 * u, 38 * u, 18 * u);
      ctx.fillStyle = gold ? '#ffd43b' : '#495057'; ctx.fillRect(32 * u, -11 * u, 8 * u, 22 * u);
      ctx.fillStyle = gold ? '#fab005' : '#212529'; ctx.beginPath(); ctx.arc(0, 0, 15 * u, 0, 7); ctx.fill();
      if (rc > .6) { ctx.fillStyle = 'rgba(255,200,80,' + rc + ')'; ctx.beginPath(); ctx.arc(46 * u, 0, 12 * u * rc, 0, 7); ctx.fill(); }
    } else if (ty === 'gelo') {
      ctx.fillStyle = '#d0ebff'; ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(36 * u, 0); ctx.lineTo(4 * u, -11 * u); ctx.lineTo(-10 * u, 0); ctx.lineTo(4 * u, 11 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.rotate(now * 2); ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.arc(16 * u, 0, 2.5 * u, 0, 7); ctx.fill(); }
      ctx.restore();
    } else if (ty === 'mago') {
      ctx.strokeStyle = '#5f3dc4'; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.moveTo(-14 * u, 0); ctx.lineTo(22 * u, 0); ctx.stroke();
      const g = ctx.createRadialGradient(28 * u, 0, 1, 28 * u, 0, (12 + rc * 8) * u);
      g.addColorStop(0, '#fff'); g.addColorStop(.4, '#d0bfff'); g.addColorStop(1, 'rgba(151,117,250,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(28 * u, 0, (12 + rc * 8) * u, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(28 * u, 0); ctx.rotate(-now * 4); ctx.fillStyle = '#e5dbff';
      for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.arc(13 * u, 0, 2.2 * u, 0, 7); ctx.fill(); }
      ctx.restore();
    } else if (ty === 'dragao') {
      const jaw = (rc > .3 ? .45 : .12 + Math.sin(now * 6) * .05);
      ctx.fillStyle = '#e64980';
      ctx.beginPath(); ctx.moveTo(-14 * u, -12 * u); ctx.lineTo(24 * u, -6 * u); ctx.lineTo(30 * u, -2 * u * (1 + jaw * 6)); ctx.lineTo(4 * u, 4 * u); ctx.lineTo(-14 * u, 12 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c2255c';
      ctx.beginPath(); ctx.moveTo(2 * u, 4 * u); ctx.lineTo(28 * u, 2 * u * (1 + jaw * 6)); ctx.lineTo(4 * u, 12 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.moveTo(-10 * u, -11 * u); ctx.lineTo(-20 * u, -22 * u); ctx.lineTo(-2 * u, -12 * u); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8 * u, -6 * u, 4 * u, 0, 7); ctx.fill();
      ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.arc(9 * u, -6 * u, 2 * u, 0, 7); ctx.fill();
      if (rc > .4) { ctx.fillStyle = 'rgba(255,146,43,' + rc + ')'; ctx.beginPath(); ctx.arc(36 * u, 0, 10 * u * rc, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    if (hitT > 0) { ctx.globalAlpha = hitT / 10; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy - cs * .06, cs * .3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    if (tw.stun > 0) {
      const kind = G.stunKind[tw.id];
      if (kind === 'maldicao') {
        ctx.save(); ctx.translate(cx, cy - cs * .1); ctx.rotate(now * 3);
        for (let i = 0; i < 3; i++) { ctx.rotate(2.09); ctx.fillStyle = '#9775fa'; ctx.beginPath(); ctx.arc(cs * .32, 0, cs * .07, 0, 7); ctx.fill(); }
        ctx.restore(); ctx.fillStyle = '#000'; ctx.font = (cs * .3) + 'px sans-serif'; ctx.fillText('💫', cx, cy - cs * .55);
      } else {
        ctx.globalAlpha = .55; round(cx - cs * .42, cy - cs * .45, cs * .84, cs * .8, cs * .1, '#d0ebff'); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(cx - cs * .42, cy - cs * .45, cs * .84, cs * .8);
        ctx.beginPath(); ctx.moveTo(cx - cs * .3, cy - cs * .3); ctx.lineTo(cx - cs * .1, cy - cs * .1); ctx.stroke();
      }
    }
  }
  const MATK = { tinta: '#343a40', teia: '#f1f3f5', raio: '#ffe066', gosma: '#8ce99a', mordida: '#fa5252', mergulho: '#9775fa', pedra: '#868e96', veneno: '#94d82d', maldicao: '#9775fa', neve: '#f8f9fa', congela: '#74c0fc', gelo: '#a5d8ff', fogo: '#ff922b', lava: '#e8590c' };
  function drawMonsterShots(now) {
    for (let i = G.mshots.length - 1; i >= 0; i--) {
      const m = G.mshots[i]; m.t += Math.max(G.speed, .0001);
      const f = Math.min(1, m.t / 12), arc = (m.kind === 'pedra' || m.kind === 'lava' || m.kind === 'neve') ? Math.sin(f * Math.PI) * cs * .9 : 0;
      const x = m.x1 + (m.x2 - m.x1) * f, y = m.y1 + (m.y2 - m.y1) * f - arc;
      if (f >= 1) {
        G.mshots.splice(i, 1);
        G.thit[m.tw] = 10;
        G.parts.push({ x: m.x2 + (Math.random() - .5) * cs * .3, y: m.y2 - cs * .45, vx: 0, vy: -.9, life: 34, max: 34, txt: '-' + m.dmg, c: '#ff6b6b' });
        for (let j = 0; j < 10; j++) { const a = Math.random() * 6.28; G.parts.push({ x: m.x2, y: m.y2, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 1, life: 16, max: 16, c: MATK[m.kind], r: cs * .05 }); }
        continue;
      }
      const c = MATK[m.kind];
      if (m.kind === 'congela') { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(x, y); ctx.stroke(); }
      if (m.kind === 'maldicao') { for (let j = 0; j < 4; j++) { ctx.globalAlpha = .3 + j * .15; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x - (m.x2 - m.x1) * .03 * j, y - (m.y2 - m.y1) * .03 * j + Math.sin(now * 20 + j) * 3, cs * (.06 + j * .02), 0, 7); ctx.fill(); } ctx.globalAlpha = 1; continue; }
      const g = ctx.createRadialGradient(x, y, 1, x, y, cs * .13); g.addColorStop(0, '#fff'); g.addColorStop(.35, c); g.addColorStop(1, c + '00');
      ctx.fillStyle = m.kind === 'pedra' ? c : g; ctx.beginPath(); ctx.arc(x, y, cs * (m.kind === 'pedra' ? .09 : .13), 0, 7); ctx.fill();
      if (m.kind === 'fogo' || m.kind === 'lava') G.parts.push({ x, y, vx: 0, vy: -.3, life: 8, max: 8, c, r: cs * .04 });
    }
  }
  function drawZones(s, now) {
    const k = cs / Sim.CELL;
    for (const z of s.zones) {
      const x = z.x * k, y = z.y * k, r = z.r * k, a = Math.min(1, z.t / 15);
      ctx.globalAlpha = .45 * a;
      ctx.fillStyle = z.k === 'gelo' ? '#a5d8ff' : z.k === 'agua' ? '#3bc9db' : '#ff6b00'; ctx.beginPath(); ctx.ellipse(x, y, r, r * .6, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = a;
      if (z.k === 'agua') {
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
        for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(x, y, r * (.3 + ((now * .8 + i * .5) % 1) * .7), r * .4 * (.3 + ((now * .8 + i * .5) % 1) * .7), 0, 0, 7); ctx.stroke(); }
      } else if (z.k === 'gelo') {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) { const ang = i * 1.256 + z.id, px = x + Math.cos(ang) * r * .55, py = y + Math.sin(ang) * r * .33;
          ctx.beginPath(); for (let j = 0; j < 3; j++) { const b = j * 1.047; ctx.moveTo(px - Math.cos(b) * 4, py - Math.sin(b) * 4); ctx.lineTo(px + Math.cos(b) * 4, py + Math.sin(b) * 4); } ctx.stroke(); }
      } else {
        for (let i = 0; i < 5; i++) {
          const px = x + Math.cos(i * 1.256 + z.id) * r * .5, py = y + Math.sin(i * 1.256 + z.id) * r * .3, h = cs * (.18 + Math.abs(Math.sin(now * 9 + i + z.id)) * .14);
          ctx.fillStyle = i % 2 ? '#ffd43b' : '#ff922b';
          ctx.beginPath(); ctx.moveTo(px - cs * .06, py); ctx.quadraticCurveTo(px, py - h * 1.3, px + cs * .06, py); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawProjectiles(k, alpha) {
    for (let i = G.proj.length - 1; i >= 0; i--) {
      const p = G.proj[i]; p.t += G.speed || 0.0001;
      const tp = enemyPos(p.e, k, alpha); if (tp) { p.x2 = tp[0]; p.y2 = tp[1]; }
      const f = Math.min(1, p.t / p.dur);
      let x = (p.x1 + (p.x2 - p.x1) * f) * k, y = (p.y1 + (p.y2 - p.y1) * f) * k;
      if (p.k === 'canhao') y -= Math.sin(f * Math.PI) * cs * .7;      // bala faz arco
      const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
      if (f >= 1) { impact(p, k); G.proj.splice(i, 1); continue; }
      ctx.save(); ctx.translate(x, y);
      if (p.k === 'corte') {                                // corte de lâmina
        ctx.restore(); ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,' + (1 - f) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x2 * k, p.y2 * k, cs * .35, ang - 1.2 + f * 2, ang + .2 + f * 2); ctx.stroke();
        ctx.strokeStyle = p.col || '#fa5252'; ctx.lineWidth = 2; ctx.stroke();
      } else if (p.k === 'onda') {                          // onda de choque do sino
        ctx.restore(); ctx.save();
        ctx.strokeStyle = 'rgba(255,212,59,' + (1 - f) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x2 * k, p.y2 * k, cs * (.3 + f * 1.4), 0, 7); ctx.stroke();
      } else if (p.k === 'meteoro') {                       // cai do céu
        ctx.restore(); ctx.save();
        const mx = p.x2 * k - (1 - f) * cs * 3, my = p.y2 * k - (1 - f) * cs * 5;
        const g = ctx.createRadialGradient(mx, my, 1, mx, my, cs * .25); g.addColorStop(0, '#fff'); g.addColorStop(.4, p.col || '#ff922b'); g.addColorStop(1, 'rgba(201,42,42,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, cs * .25, 0, 7); ctx.fill();
        G.parts.push({ x: mx, y: my, vx: -.5, vy: -.8, life: 10, max: 10, c: '#ff922b', r: cs * .05 });
      } else if (p.k === 'feixeolho') {
        ctx.restore(); ctx.save();
        ctx.strokeStyle = p.col || '#c92a2a'; ctx.globalAlpha = .8; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(p.x1 * k, p.y1 * k); ctx.lineTo(p.x2 * k, p.y2 * k); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (p.k === 'raio' || p.k === 'raioceu') {              // raio elétrico em zigue-zague
        ctx.restore(); ctx.save();
        const x0 = p.k === 'raioceu' ? p.x2 * k + (Math.random() - .5) * cs : p.x1 * k, y0 = p.k === 'raioceu' ? -cs : p.y1 * k;
        const x1 = p.x2 * k, y1 = p.y2 * k;
        ctx.strokeStyle = p.k === 'raioceu' ? '#fff3bf' : '#a5d8ff'; ctx.lineWidth = p.k === 'raioceu' ? 5 : 3; ctx.shadowColor = '#74c0fc'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let i = 1; i < 6; i++) ctx.lineTo(x0 + (x1 - x0) * i / 6 + (Math.random() - .5) * cs * .35, y0 + (y1 - y0) * i / 6 + (Math.random() - .5) * cs * .2);
        ctx.lineTo(x1, y1); ctx.stroke(); ctx.shadowBlur = 0;
      } else if (p.k === 'feixe') {                         // raio de sol contínuo
        ctx.restore(); ctx.save();
        ctx.strokeStyle = 'rgba(255,212,59,.85)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(p.x1 * k, p.y1 * k); ctx.lineTo(p.x2 * k, p.y2 * k); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
      } else if (p.k === 'veneno') {
        ctx.fillStyle = '#82c91e'; ctx.beginPath(); ctx.arc(0, 0, cs * .11, 0, 7); ctx.fill(); ctx.fillStyle = '#d8f5a2'; ctx.beginPath(); ctx.arc(-cs * .03, -cs * .03, cs * .04, 0, 7); ctx.fill();
      } else if (p.k === 'vento') {
        ctx.rotate(-f * 20); for (let i = 0; i < 3; i++) { ctx.rotate(2.1); ctx.strokeStyle = '#e3fafc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cs * .08, 0, cs * .16, -1, 1.4); ctx.stroke(); }
      } else if (p.k === 'agua') {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, cs * .22); g.addColorStop(0, '#fff'); g.addColorStop(.4, '#3bc9db'); g.addColorStop(1, 'rgba(25,113,194,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, cs * .22, 0, 7); ctx.fill();
      } else if (p.k === 'arqueiro') {
        ctx.rotate(ang); ctx.strokeStyle = p.gold ? '#e67700' : '#5c3a14'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-cs * .22, 0); ctx.lineTo(cs * .1, 0); ctx.stroke();
        ctx.fillStyle = p.gold ? '#ffd43b' : '#ced4da'; ctx.beginPath(); ctx.moveTo(cs * .16, 0); ctx.lineTo(cs * .08, -4); ctx.lineTo(cs * .08, 4); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(-cs * .22, -3, 5, 6);
      } else if (p.k === 'lanceiro') {
        ctx.rotate(ang); if (p.tk === 'balista') ctx.scale(1.5, 1.5); ctx.strokeStyle = '#7c4a1e'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-cs * .42, 0); ctx.lineTo(cs * .18, 0); ctx.stroke();
        ctx.fillStyle = '#dee2e6'; ctx.beginPath(); ctx.moveTo(cs * .32, 0); ctx.lineTo(cs * .16, -6); ctx.lineTo(cs * .16, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-cs * .8, -3); ctx.lineTo(-cs * .45, -3); ctx.moveTo(-cs * .8, 3); ctx.lineTo(-cs * .45, 3); ctx.stroke();
      } else if (p.k === 'canhao') {
        ctx.fillStyle = p.gold ? '#fab005' : '#212529'; ctx.beginPath(); ctx.arc(0, 0, cs * .1, 0, 7); ctx.fill();
        ctx.fillStyle = '#868e96'; ctx.beginPath(); ctx.arc(-cs * .03, -cs * .03, cs * .03, 0, 7); ctx.fill();
      } else if (p.k === 'gelo') {
        ctx.rotate(ang); ctx.fillStyle = '#a5d8ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cs * .14, 0); ctx.lineTo(0, -cs * .06); ctx.lineTo(-cs * .12, 0); ctx.lineTo(0, cs * .06); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (p.k === 'mago') {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, cs * .16); g.addColorStop(0, '#fff'); g.addColorStop(.5, '#b197fc'); g.addColorStop(1, 'rgba(151,117,250,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, cs * .16, 0, 7); ctx.fill();
      } else if (p.k === 'dragao') {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, cs * .15); g.addColorStop(0, '#fff3bf'); g.addColorStop(.5, '#ff922b'); g.addColorStop(1, 'rgba(240,62,62,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, cs * .15, 0, 7); ctx.fill();
        if (Math.random() < .7) G.parts.push({ x, y, vx: (Math.random() - .5) * 1.5, vy: (Math.random() - .5) * 1.5, life: 12, max: 12, c: '#ff922b', r: cs * .05 });
      }
      ctx.restore();
    }
    // partículas
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i]; q.life--; if (q.life <= 0) { G.parts.splice(i, 1); continue; }
      q.x += q.vx; q.y += q.vy; q.vy += q.g || 0;
      ctx.globalAlpha = q.life / q.max;
      if (q.txt) { ctx.fillStyle = q.c; ctx.font = 'bold ' + (cs * .3) + 'px sans-serif'; ctx.strokeStyle = '#0008'; ctx.lineWidth = 3; ctx.strokeText(q.txt, q.x, q.y); ctx.fillText(q.txt, q.x, q.y); }
      else if (q.ring) { ctx.strokeStyle = q.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, q.ring * (1 - q.life / q.max) + 2, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
  }
  function impact(p, k) {
    const x = p.x2 * k, y = p.y2 * k, c = p.gold ? '#ffd43b' : p.col && p.k !== 'arqueiro' ? p.col : { arqueiro: '#ffe066', gelo: '#d0ebff', canhao: '#ff922b', lanceiro: '#dee2e6', mago: '#d0bfff', dragao: '#ff6b6b', raio: '#a5d8ff', raioceu: '#fff3bf', feixe: '#ffd43b', veneno: '#94d82d', vento: '#e3fafc', agua: '#3bc9db' }[p.k];
    const n = p.k === 'canhao' ? 12 : p.k === 'arqueiro' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (p.k === 'canhao' ? 2.5 : 1.5) * (0.5 + Math.random());
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 14, max: 14, c, r: cs * (p.k === 'canhao' ? .06 : .035) });
    }
    if (p.splash) G.parts.push({ x, y, vx: 0, vy: 0, life: 12, max: 12, c, ring: p.splash * k });
  }
  function round(x, y, w, h, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); }

  // ----- toque no mapa -----
  cv.addEventListener('pointerdown', (ev) => {
    if (!G || G.s.status !== 'playing') return;
    const s = G.s, r = cv.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / cs), y = Math.floor((ev.clientY - r.top) / cs);
    if (x < 0 || y < 0 || x >= Sim.COLS || y >= Sim.ROWS) return;
    const tw = s.towers.find(t => t.x === x && t.y === y);
    G.sel = null; G.selCell = null; G.selSlot = null; G.selRock = null;
    const b = s.blocked[x + ',' + y];
    if (tw) G.sel = tw;
    else if (s.slots.some(q => q.x === x && q.y === y)) G.selSlot = [x, y];
    else if (b === 4) {
      const t = s.treas.find(q => q.x === x && q.y === y);
      if (t.open) toast('Já foi aberto');
      else if (t.k === 'bau') {
        const before = s.gold;
        if (doAction({ a: 'open', x, y })) {
          const k = cs / Sim.CELL;
          G.parts.push({ x: (x + .5) * cs, y: y * cs, vx: 0, vy: -.8, life: 40, max: 40, txt: '+' + (s.gold - before) + ' 🪙', c: '#ffd43b' });
          for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28; G.parts.push({ x: (x + .5) * cs, y: (y + .5) * cs, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5 - 2, g: .12, life: 26, max: 26, c: '#ffd43b', r: cs * .05 }); }
          toast('🎁 Baú aberto! +' + (s.gold - before) + ' de ouro');
        }
      } else G.selRock = [x, y];
    } else if (b === 5) {
      if (s.secret.found) toast('🗝️ Vença a fase para entrar na fase secreta!');
      else if (doAction({ a: 'secret', x, y })) {
        for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28; G.parts.push({ x: (x + .5) * cs, y: (y + .5) * cs, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 30, max: 30, c: ['#d0bfff', '#fff', '#ffd43b'][i % 3], r: cs * .05 }); }
        modalGame('✨ Passagem secreta!', 'Você achou um lugar misterioso! <b>Vença esta fase</b> para liberar a <b>Fase Secreta</b> com tesouros. 🗝️');
      }
    } else if (b === 6) {
      if (s.relic.found) toast('🗡️ Vença a fase para levar a arma secreta!');
      else if (doAction({ a: 'relic', x, y })) {
        for (let i = 0; i < 36; i++) { const a = Math.random() * 6.28; G.parts.push({ x: (x + .5) * cs, y: (y + .5) * cs, vx: Math.cos(a) * 3.5, vy: Math.sin(a) * 3.5, life: 34, max: 34, c: ['#c92a2a', '#fff', '#ffd43b'][i % 3], r: cs * .05 }); }
        modalGame('🗡️ RELÍQUIA ENCONTRADA!', 'Uma <b>ARMA SECRETA</b> estava escondida aqui! <b>Vença esta fase</b> para liberar a arma.');
      }
    } else if (b === 3) toast('Não dá para construir em cima disso');
    else if (b === 1) toast('Torres não vão no caminho. Use os trechos ⚠️ para armadilhas!');
    else if (!b) G.selCell = [x, y];
    renderPanel();
  });
  function modalGame(title, text) {
    const sp = G.speed; G.speed = 0;
    modal(`<h2>${title}</h2><p>${text}</p><button class="btn gold" id="m-ok" style="width:100%">Continuar</button>`);
    $('m-ok').onclick = () => { closeModal(); if (G) G.speed = sp || 1; };
  }

  function renderPanel() {
    const p = $('panel'), s = G.s;
    if (G.sel) {
      const tw = G.sel, t = T[tw.type], st = Sim.towerStats(s, tw), c = Sim.upgradeCost(tw);
      const mhp = Sim.towerMaxHp(tw), rc = Sim.repairCost(tw);
      p.innerHTML = `<div class="tinfo"><span class="e">${t.icon}</span><div class="info"><b>${t.name} nv ${tw.lvl}</b><br>Dano ${st.dmg} · ❤️ Vida ${Math.max(0, tw.hp)}/${mhp}${tw.stun > 0 ? ' · <span style="color:#74c0fc">parada!</span>' : ''}</div>
        ${tw.hp < mhp ? `<button class="btn" id="p-fix" data-c="${rc}" style="padding:10px 8px">🔧${rc}</button>` : ''}
        ${tw.lvl < Sim.MAX_TLVL ? `<button class="btn gold" id="p-up" data-c="${c}">⬆ ${c}</button>` : '<b>MÁX</b>'}
        <button class="btn pink" id="p-sell">Vender ${Math.floor(tw.spent * .6)}</button></div>`;
      if ($('p-up')) $('p-up').onclick = () => { if (doAction({ a: 'up', id: tw.id })) renderPanel(); else toast('Ouro insuficiente'); };
      if ($('p-fix')) $('p-fix').onclick = () => { if (doAction({ a: 'repair', id: tw.id })) { toast('🔧 Torre consertada!'); renderPanel(); } else toast('Ouro insuficiente'); };
      $('p-sell').onclick = () => { doAction({ a: 'sell', id: tw.id }); G.sel = null; renderPanel(); };
    } else if (G.selSlot) {
      const [x, y] = G.selSlot, cur = s.traps.find(t => t.x === x && t.y === y && !t.used);
      p.innerHTML = Object.keys(Sim.TRAPS).map(k => { const t = Sim.TRAPS[k];
        return `<button class="tw" data-trap="${k}" data-c="${t.cost}"><span class="e">${t.icon}</span>${t.name}<b>🪙${t.cost}</b><small style="display:block;opacity:.7;font-size:9px">${t.desc}</small></button>`; }).join('');
      if (cur) p.insertAdjacentHTML('afterbegin', `<div class="panel-msg" style="flex:none;width:70px;font-size:11px">Armadilha:<br>${Sim.TRAPS[cur.k].icon} ativa</div>`);
      p.querySelectorAll('[data-trap]').forEach(b => b.onclick = () => {
        if (cur) return toast('Já tem armadilha aqui');
        if (doAction({ a: 'trap', x, y, k: b.dataset.trap })) { G.selSlot = null; renderPanel(); toast(Sim.TRAPS[b.dataset.trap].icon + ' Armadilha armada!'); }
        else toast('Ouro insuficiente');
      });
    } else if (G.selRock) {
      const [x, y] = G.selRock;
      p.innerHTML = `<div class="tinfo"><span class="e">💎</span><div class="info"><b>Pedra com gemas</b><br>Quebre e ganhe 💎${Sim.GEMS_PER_ROCK} ao vencer a fase (só na 1ª vez)</div>
        <button class="btn gold" id="p-rock" data-c="${Sim.GEM_ROCK_COST}">⛏ 🪙${Sim.GEM_ROCK_COST}</button></div>`;
      $('p-rock').onclick = () => {
        if (!doAction({ a: 'open', x, y })) return toast('Ouro insuficiente');
        for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28; G.parts.push({ x: (x + .5) * cs, y: (y + .5) * cs, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 - 1.5, g: .1, life: 28, max: 28, c: ['#f783ac', '#66d9e8', '#adb5bd'][i % 3], r: cs * .05 }); }
        G.parts.push({ x: (x + .5) * cs, y: y * cs, vx: 0, vy: -.7, life: 40, max: 40, txt: '+💎' + Sim.GEMS_PER_ROCK, c: '#f783ac' });
        G.selRock = null; renderPanel(); toast('💎 Gemas guardadas! Vença para levar.');
      };
    } else if (G.selCell) {
      const RO = Sim.RARITY_IDS.concat('secreta');
      p.innerHTML = Sim.TOWER_IDS.filter(k => Sim.canUse(s, k)).sort((a, b) => RO.indexOf(T[b].rar) - RO.indexOf(T[a].rar)).map(k => {
        const t = T[k], ok = true;
        return `<button class="tw" data-k="${k}" data-c="${t.cost}" style="border-color:${Sim.RARITIES[t.rar].color}"><span class="e">${t.icon}</span>${t.name}<b>🪙${t.cost}</b></button>`;
      }).join('');
      p.querySelectorAll('.tw').forEach(b => b.onclick = () => {
        const k = b.dataset.k;
        if (!Sim.canUse(s, k)) return toast(T[k].premium ? 'Libere o Dragão na Loja 🐉' : 'Libera na fase ' + T[k].unlock);
        if (doAction({ a: 'build', x: G.selCell[0], y: G.selCell[1], k })) { G.selCell = null; renderPanel(); }
        else toast('Ouro insuficiente');
      });
    } else {
      p.innerHTML = '<div class="panel-msg">Toque num espaço livre para construir · ⚠️ armadilhas<br>🎁 tesouros · e procure lugares misteriosos!</div>';
    }
    updatePanelAfford();
  }
  function updatePanelAfford() {
    if (!G) return;
    document.querySelectorAll('#panel [data-c]').forEach(b => b.classList.toggle('no', G.s.gold < +b.dataset.c));
    if ($('p-up')) $('p-up').disabled = G.s.gold < +$('p-up').dataset.c;
  }

  $('g-next').onclick = () => doAction({ a: 'wave' });
  $('g-speed').onclick = () => { G.speed = G.speed === 1 ? 2 : 1; $('g-speed').textContent = G.speed + 'x'; };
  $('g-exit').onclick = () => {
    const sp = G.speed; G.speed = 0;
    modal(`<h2>Sair da fase?</h2><p>Você perde a energia gasta.</p><div class="row"><button class="btn" id="m-stay">Continuar</button><button class="btn pink" id="m-quit">Sair</button></div>`);
    $('m-stay').onclick = () => { G.speed = sp; closeModal(); };
    $('m-quit').onclick = () => { closeModal(); leaveGame(); };
  };

  async function finish() {
    G.sending = true;
    const s = G.s;
    const out = await act(API.finish(G.runId, G.actions));
    const won = s.status === 'won';
    if (out.error) {
      modal(`<h2>Ops!</h2><p>${out.error}</p><button class="btn" onclick="closeModal();window.__leave()">OK</button>`);
      return;
    }
    SND.fx(won || out.bonus ? 'win' : 'lose');
    const st = out.stars || 0;
    if (out.bonus) {
      modal(`<h2>🗝️ Caverna do Tesouro</h2><p>Você pegou <b>${out.kills} de ${out.total}</b> ladrões!</p>
        <div class="rw"><span>🪙 +${fmt(out.coins)}</span><span>💎 +${out.gems}</span></div>
        <button class="btn gold" id="m-home" style="width:100%">Voltar ao mapa</button>`);
      $('m-home').onclick = () => { closeModal(); leaveGame(); };
      return;
    }
    const rw2 = out.relicWeapon ? `<div class="reveal" style="--rc:#e03131"><span class="new">${out.relicWeapon.isNew ? 'ARMA SECRETA!' : '+' + out.relicWeapon.n + ' cartas'}</span><div class="ti">${T[out.relicWeapon.k].icon}</div><b>${T[out.relicWeapon.k].name}</b><small>Secreta</small></div>` : '';
    const extra = rw2 + (out.secret ? '<div class="news" style="border:1px solid #b197fc">🗝️ <b>Fase secreta liberada!</b> Procure a chave no mapa de fases.</div>' : '')
      + (out.gemRock ? `<p class="tiny">💎 ${out.gemRock} da pedra preciosa incluídas</p>` : '');
    modal(won ? `<h2>Vitória! 🎉</h2><div class="stars">${'⭐'.repeat(st)}${'<span style="opacity:.25">⭐</span>'.repeat(3 - st)}</div>
      <div class="rw"><span>🪙 +${fmt(out.coins)}</span>${out.gems ? `<span>💎 +${out.gems}</span>` : ''}</div>${extra}
      <div class="row"><button class="btn" style="background:#555;box-shadow:none" id="m-home">Mapa</button><button class="btn gold" id="m-next">Próxima ▶</button></div>`
      : `<h2>O castelo caiu 😢</h2><p>Chegou à onda ${s.wave + 1} de ${s.waves.length}.<br>Dica: melhore suas torres em ⚔️ Melhorias!</p>
      <div class="row"><button class="btn" style="background:#555;box-shadow:none" id="m-home">Mapa</button><button class="btn gold" id="m-next">Tentar de novo</button></div>`);
    const lvl = s.level;
    if (out.chests && out.chests.length) {
      const names = out.chests.map(c => E.CHESTS[c.chest].icon + ' ' + E.CHESTS[c.chest].name + (c.milestone ? ' (recompensa especial!)' : '')).join('<br>');
      $('modal-box').insertAdjacentHTML('beforeend', `<div class="news" style="text-align:center;border:1px solid #ffd43b">Você ganhou:<br><b>${names}</b></div><button class="btn secret-btn" id="m-chest-win">Abrir ${out.chests.length > 1 ? 'baús' : 'baú'}!</button>`);
      $('m-chest-win').onclick = () => { const list = out.chests.slice(); out.chests = null; leaveGame(true); go('home'); showChests(list); };
    }
    $('m-home').onclick = () => { closeModal(); leaveGame(); };
    $('m-next').onclick = () => { closeModal(); leaveGame(true); startLevel(won ? lvl + 1 : lvl); };
  }

  function leaveGame(silent) {
    G = null;
    homeMusic();
    document.body.classList.remove('ingame');
    if (!silent) go('home');
  }
  window.__leave = () => leaveGame();

  // ---------------- início ----------------
  (async function boot() {
    const out = await API.init();
    if (out.error) { $('loading').querySelector('p').textContent = out.error + ' — toque para tentar de novo'; $('loading').onclick = () => location.reload(); return; }
    setPlayer(out); liveInfo(out);
    try { await Billing.init(); } catch (e) { console.warn('billing', e); }
    if (API.demo) { const d = document.createElement('div'); d.className = 'demo-badge'; d.textContent = 'DEMO'; document.body.appendChild(d); }
    $('loading').classList.add('hidden');
    homeMusic();
    $('topbar').appendChild(window.Sound ? Sound.button() : document.createElement('i'));
    if (window.Sound) $('g-speed').after(Sound.button());
    go('home');
    renderCommunity();
    resumePay();
    if (!API.demo && P.maxLevel >= 3 && !P.email && !(function () { try { return localStorage.getItem('rg_accwarn'); } catch (e) { return 1; } })()) { try { localStorage.setItem('rg_accwarn', '1'); } catch (e) {} setTimeout(() => toast('💡 Proteja seu progresso: toque em 👤 Conta'), 1500); }
  })();
})();
