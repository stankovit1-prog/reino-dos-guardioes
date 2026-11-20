// Instalar no celular (PWA): só no site de verdade (https)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window.GAME_CONFIG || {}).DEMO) {
  try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
}
