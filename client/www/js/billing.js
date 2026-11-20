/*
 * Compras pelo Google Play (plugin cordova-plugin-purchase / CdvPurchase).
 * Fluxo: jogador paga no Google -> app recebe "purchaseToken" -> manda ao SEU servidor
 * -> servidor confirma com o Google -> entrega gemas -> app finaliza (consome) a compra.
 * O dinheiro vai para a sua conta de comerciante do Google Play (repasse mensal ao seu banco).
 */
(function () {
  'use strict';
  const IDS = Object.keys(Sim.ECON.IAP);
  const Billing = window.Billing = { ready: false, prices: {}, onGranted: null, mode: 'off' };

  async function sha256hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  }

  Billing.init = async function () {
    if (API.demo) { Billing.mode = 'demo'; Billing.ready = true; return; }
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && !window.CdvPurchase) {
      await new Promise(r => { document.addEventListener('deviceready', r, { once: true }); setTimeout(r, 5000); });
    }
    if (!window.CdvPurchase) { Billing.mode = (window.GAME_CONFIG || {}).WEB_PAY ? 'webpay' : 'web'; Billing.ready = true; return; }   // SITE: PIX/cartão (Mercado Pago)
    Billing.mode = 'play';
    const { store, ProductType, Platform } = window.CdvPurchase;
    const accHash = (await sha256hex('acc:' + API.playerId)).slice(0, 64);
    store.applicationUsername = () => accHash;   // amarra a compra à conta do jogador
    store.register(IDS.map(id => ({ id, type: ProductType.CONSUMABLE, platform: Platform.GOOGLE_PLAY })));
    store.when()
      .productUpdated((p) => { if (p.pricing) Billing.prices[p.id] = p.pricing.price; })
      .approved(async (tx) => {
        const productId = tx.products[0] && tx.products[0].id;
        const token = tx.purchaseId || (tx.nativePurchase && tx.nativePurchase.purchaseToken);
        const out = await API.verifyPurchase(productId, token);
        if (out.ok) { tx.finish(); Billing.onGranted && Billing.onGranted(out, productId); }
        else if (Billing.onError) Billing.onError(out.error);
      });
    await store.initialize([Platform.GOOGLE_PLAY]);
    Billing.store = store; Billing.Platform = Platform; Billing.ready = true;
  };

  Billing.buy = async function (productId) {
    if (Billing.mode === 'demo') {
      const out = await API.verifyPurchase(productId, 'demo');
      Billing.onGranted && Billing.onGranted(out, productId);
      return;
    }
    if (Billing.mode !== 'play' || !Billing.ready) throw new Error('Compras disponíveis apenas no app Android.');
    const p = Billing.store.get(productId, Billing.Platform.GOOGLE_PLAY);
    if (!p || !p.getOffer()) throw new Error('Produto indisponível no momento.');
    const err = await p.getOffer().order();
    if (err && err.code !== window.CdvPurchase.ErrorCode.PAYMENT_CANCELLED) throw new Error(err.message || 'Falha na compra');
  };

  Billing.priceOf = (id) => Billing.prices[id] || Sim.ECON.IAP[id].price;
})();
