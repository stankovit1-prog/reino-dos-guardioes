/*
 * PAGAMENTO NO SITE: PIX e cartão pelo Mercado Pago.
 *   MP_ACCESS_TOKEN = token de produção da sua conta Mercado Pago (Seu negócio > Credenciais)
 *   PUBLIC_URL      = endereço do seu site (ex.: https://reino-guardioes.onrender.com) — para o aviso de pagamento
 * O dinheiro cai na sua conta Mercado Pago. O servidor SÓ entrega as gemas depois de confirmar no Mercado Pago.
 */
'use strict';
const crypto = require('crypto');
const TOKEN = process.env.MP_ACCESS_TOKEN || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const PROD = process.env.NODE_ENV === 'production';
const enabled = !!TOKEN;
const DEV_FAKE = !PROD && !enabled && process.env.IAP_DEV_FAKE === '1';
const fake = new Map();     // pagamentos de mentira (só em desenvolvimento)

async function mp(method, path, body) {
  const r = await fetch('https://api.mercadopago.com' + path, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'X-Idempotency-Key': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Mercado Pago: ' + (j.message || r.status));
  return j;
}

// Cria PIX (QR code + copia e cola)
async function createPix({ ref, amount, title, email }) {
  if (DEV_FAKE) { const id = 'dev' + Date.now(); fake.set(id, { id, status: 'pending', external_reference: ref, transaction_amount: amount }); return { id, qr: 'PIX-DE-TESTE-' + id, qrImage: '', ticket: '' }; }
  if (!enabled) throw new Error('Pagamento no site ainda não configurado');
  const p = await mp('POST', '/v1/payments', {
    transaction_amount: amount, description: title, payment_method_id: 'pix',
    payer: { email }, external_reference: ref,
    notification_url: PUBLIC_URL ? PUBLIC_URL + '/api/pay/mp-webhook' : undefined,
    date_of_expiration: new Date(Date.now() + 30 * 60000).toISOString().replace('Z', '-00:00'),
  });
  const td = (p.point_of_interaction && p.point_of_interaction.transaction_data) || {};
  return { id: String(p.id), qr: td.qr_code, qrImage: td.qr_code_base64, ticket: td.ticket_url };
}

// Cria link de pagamento com CARTÃO (Checkout Pro do Mercado Pago)
async function createCardLink({ ref, amount, title, email }) {
  if (DEV_FAKE) { const id = 'dev' + Date.now(); fake.set(id, { id, status: 'pending', external_reference: ref, transaction_amount: amount }); return { url: '#pagamento-de-teste', id }; }
  if (!enabled) throw new Error('Pagamento no site ainda não configurado');
  const pref = await mp('POST', '/checkout/preferences', {
    items: [{ title, quantity: 1, unit_price: amount, currency_id: 'BRL' }],
    payer: { email }, external_reference: ref,
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 1 },
    notification_url: PUBLIC_URL ? PUBLIC_URL + '/api/pay/mp-webhook' : undefined,
    back_urls: PUBLIC_URL ? { success: PUBLIC_URL + '/?pago=1', pending: PUBLIC_URL + '/', failure: PUBLIC_URL + '/' } : undefined,
    auto_return: PUBLIC_URL ? 'approved' : undefined,
  });
  return { url: pref.init_point, id: pref.id };
}

async function getPayment(id) {
  if (DEV_FAKE && fake.has(String(id))) return fake.get(String(id));
  return mp('GET', '/v1/payments/' + encodeURIComponent(id));
}
// procura pagamentos pela referência (usado para conferir PIX e cartão)
async function findByRef(ref) {
  if (DEV_FAKE) return [...fake.values()].filter(p => p.external_reference === ref);
  const j = await mp('GET', '/v1/payments/search?external_reference=' + encodeURIComponent(ref) + '&sort=date_created&criteria=desc');
  return j.results || [];
}
function devApprove(id) { const p = fake.get(String(id)) || [...fake.values()].find(x => x.external_reference === String(id)); if (DEV_FAKE && p) { p.status = 'approved'; return true; } return false; }

module.exports = { enabled, DEV_FAKE, createPix, createCardLink, getPayment, findByRef, devApprove };
