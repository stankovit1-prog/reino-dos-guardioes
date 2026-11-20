// INSTALAR NO CELULAR / TABLET (o site vira um ícone na tela inicial, abre em tela cheia)
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window.GAME_CONFIG || {}).DEMO) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
  }
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (standalone) return;                                         // já está instalado
  var deferred = null;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function btn() { return document.getElementById('install-btn'); }
  function show() { var b = btn(); if (b) b.classList.remove('hidden'); }
  // Android / Chrome / Edge: o navegador oferece instalar
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; show(); });
  window.addEventListener('appinstalled', function () { var b = btn(); if (b) b.classList.add('hidden'); deferred = null; });
  document.addEventListener('DOMContentLoaded', function () {
    var b = btn(); if (!b) return;
    if (ios) show();                                              // iPhone/iPad: instruções
    b.onclick = function () {
      if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; }); return; }
      var box = document.getElementById('modal-box'), m = document.getElementById('modal');
      if (!box || !m) return;
      box.innerHTML = ios
        ? '<h2>📲 Instalar no iPhone / iPad</h2><p>1. Toque em <b>Compartilhar</b> (quadrado com seta ⬆️) no Safari.<br>2. Escolha <b>Adicionar à Tela de Início</b>.<br>3. Toque em <b>Adicionar</b>.</p><button class="btn gold" onclick="closeModal()" style="width:100%">Entendi</button>'
        : '<h2>📲 Instalar</h2><p>Abra o menu do navegador (⋮) e toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p><button class="btn gold" onclick="closeModal()" style="width:100%">Entendi</button>';
      m.classList.remove('hidden');
    };
  });
})();
