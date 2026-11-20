// Configuração do jogo.
//  - No SITE: o servidor gera este arquivo sozinho (não precisa mexer).
//  - No APP Android: troque DEMO para false e coloque o endereço do servidor em API_URL.
window.GAME_CONFIG = {
  DEMO: true,                 // true = demonstração (sem servidor, compras simuladas)
  API_URL: '',                // ex.: 'https://reino-guardioes.onrender.com'
  GOOGLE_CLIENT_ID: '',       // ID do cliente OAuth "Aplicativo da Web" (para Entrar com Google)
  WEB_PAY: false,
};
