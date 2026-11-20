/*
 * Conversa com a API oficial do Google Play para confirmar pagamentos.
 * Precisa de uma "conta de serviço" do Google Cloud com acesso ao Play Console.
 *   GOOGLE_APPLICATION_CREDENTIALS = caminho do arquivo .json da conta de serviço
 *   ANDROID_PACKAGE = id do app (ex.: com.seunome.reinodosguardioes)
 */
'use strict';
const crypto = require('crypto');
const { GoogleAuth } = require('google-auth-library');

const PKG = process.env.ANDROID_PACKAGE || 'com.seunome.reinodosguardioes';
const PROD = process.env.NODE_ENV === 'production';
const enabled = !!(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
// Modo teste local: aceita tokens "teste_..." SEM cobrar. Nunca liga em produção.
const DEV_FAKE = !PROD && !enabled && process.env.IAP_DEV_FAKE === '1';

let client;
async function api(url) {
  if (!client) {
    const opts = { scopes: ['https://www.googleapis.com/auth/androidpublisher'] };
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) opts.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    client = await new GoogleAuth(opts).getClient();
  }
  const r = await client.request({ url });
  return r.data;
}

// Mesmo hash que o app manda ao Google na hora da compra (amarra compra -> conta)
const accountHash = (playerId) => crypto.createHash('sha256').update('acc:' + playerId).digest('hex').slice(0, 64);

async function verifyProduct(productId, token) {
  if (DEV_FAKE && token.startsWith('teste_')) return { purchaseState: 0, orderId: 'DEV-' + token, purchaseType: 0 };
  if (!enabled) throw new Error('Google Play não configurado no servidor');
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PKG)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  return api(url);
}

async function listVoided() {
  if (!enabled) return [];
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PKG)}/purchases/voidedpurchases?type=0`;
  const d = await api(url);
  return d.voidedPurchases || [];
}

module.exports = { enabled, verifyProduct, listVoided, accountHash };
