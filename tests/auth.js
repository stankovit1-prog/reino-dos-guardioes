// Testes de cadastro/login por e-mail, vinculação SMS e recuperação com provedor HTTP simulado.
const http = require('http');
const received = [];
const provider = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    if (req.headers.authorization !== 'Bearer token-de-teste') { res.writeHead(401); return res.end(); }
    try { received.push(JSON.parse(body)); } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
  });
});
const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) process.exitCode = 1; };
provider.listen(0, async () => {
  process.env.IAP_DEV_FAKE = '1';
  process.env.DB_PATH = ':memory:';
  process.env.AUTH_DELIVERY_URL = 'http://127.0.0.1:' + provider.address().port + '/send';
  process.env.AUTH_DELIVERY_TOKEN = 'token-de-teste';
  const { app } = require('../server/server.js');
  const srv = app.listen(0, async () => {
    const base = 'http://127.0.0.1:' + srv.address().port;
    const client = () => {
      let token = '';
      return {
        async call(path, body, method) {
          const r = await fetch(base + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
          const data = await r.json(); if (data.token) token = data.token; return data;
        }
      };
    };
    try {
      const c1 = client();
      const guest = await c1.call('/api/auth/guest', { deviceId: 'a'.repeat(40) });
      const start = await c1.call('/api/auth/email/start', { email: 'jogador@example.com', password: 'Senha-forte-123' });
      ok(start.ok && start.challengeId, 'cadastro solicita confirmação de e-mail');
      const mailCode = received.findLast(x => x.channel === 'email' && x.purpose === 'email_register')?.code;
      const registered = await c1.call('/api/auth/email/verify', { challengeId: start.challengeId, code: mailCode, deviceId: 'a'.repeat(40) });
      ok(registered.token && registered.playerId === guest.playerId, 'e-mail confirmado vincula o progresso atual do convidado');
      const c2 = client();
      const logged = await c2.call('/api/auth/email/login', { email: 'JOGADOR@example.com', password: 'Senha-forte-123', deviceId: 'b'.repeat(40) });
      ok(logged.token && logged.playerId === guest.playerId, 'login em outro aparelho recupera a mesma conta');
      const phoneStart = await c1.call('/api/account/phone/start', { phone: '+5511999999999' });
      const smsCode = received.findLast(x => x.channel === 'sms' && x.purpose === 'phone_link')?.code;
      const phoneDone = await c1.call('/api/account/phone/verify', { challengeId: phoneStart.challengeId, code: smsCode });
      ok(phoneDone.ok, 'telefone confirmado e vinculado à conta');
      const recovery = await c2.call('/api/auth/recovery/start', { channel: 'email', email: 'jogador@example.com' });
      const recoveryCode = received.findLast(x => x.channel === 'email' && x.purpose === 'password_recovery')?.code;
      const reset = await c2.call('/api/auth/recovery/verify', { challengeId: recovery.challengeId, code: recoveryCode, password: 'Outra-senha-456', deviceId: 'b'.repeat(40) });
      ok(reset.token && reset.playerId === guest.playerId, 'recuperação por e-mail redefine senha sem perder conta');
      const c3 = client();
      const oldPassword = await c3.call('/api/auth/email/login', { email: 'jogador@example.com', password: 'Senha-forte-123', deviceId: 'c'.repeat(40) });
      const newPassword = await c3.call('/api/auth/email/login', { email: 'jogador@example.com', password: 'Outra-senha-456', deviceId: 'c'.repeat(40) });
      ok(oldPassword.error && newPassword.token, 'senha antiga recusada e nova senha aceita');
      const smsRecovery = await c1.call('/api/auth/recovery/start', { channel: 'sms', phone: '+5511999999999' });
      const smsRecoveryCode = received.findLast(x => x.channel === 'sms' && x.purpose === 'password_recovery')?.code;
      const smsReset = await c1.call('/api/auth/recovery/verify', { challengeId: smsRecovery.challengeId, code: smsRecoveryCode, password: 'Senha-final-789' });
      ok(smsReset.token && smsReset.playerId === guest.playerId, 'recuperação por SMS funciona para telefone verificado');
      const account = await c1.call('/api/account');
      ok(account.emailLogin && account.hasPhone, 'conta informa e-mail e telefone vinculados');
      const invalid = await c1.call('/api/auth/email/login', { email: 'jogador@example.com', password: '123' });
      ok(invalid.error, 'senha incorreta recusada');
    } catch (e) { console.error(e); process.exitCode = 1; }
    finally { srv.close(); provider.close(); }
  });
});
