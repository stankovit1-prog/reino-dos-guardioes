// Testes de integração do modo cooperativo: duas contas entram e vencem a mesma fase.
process.env.IAP_DEV_FAKE = '1';
process.env.DB_PATH = ':memory:';
process.env.PORT = '0';
const { app, db } = require('../server/server.js');
const play = require('./bot.js');
const srv = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const ok = (value, label) => {
    console.log((value ? '✅ ' : '❌ ') + label);
    if (!value) process.exitCode = 1;
  };
  async function login(device) {
    const response = await fetch(base + '/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: device.repeat(40).slice(0, 40) })
    });
    return response.json();
  }
  async function call(token, path, body) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return response.json();
  }
  try {
    const host = await login('a');
    const guest = await login('b');
    const created = await call(host.token, '/api/multi/create', {});
    ok(created.ok && /^[A-Z0-9]{6}$/.test(created.room.code), 'cria sala privada com código');
    const joined = await call(guest.token, '/api/multi/join', { code: created.room.code });
    ok(joined.ok && joined.room.players.length === 2, 'segundo jogador entra na sala');
    const started = await call(host.token, '/api/multi/start', { code: created.room.code, level: 1 });
    ok(started.ok && started.room.status === 'playing', 'líder inicia a batalha compartilhada');
    const guestState = await call(guest.token, '/api/multi/state?code=' + created.room.code);
    ok(guestState.room.status === 'playing' && guestState.cfg.level === 1 && guestState.runId, 'aliado recebe a mesma fase e sua tentativa individual');
    const queued = await call(guest.token, '/api/multi/action', {
      code: created.room.code, action: { a: 'wave' }
    });
    ok(queued.ok && queued.queued, 'aliado envia comando ao tabuleiro compartilhado');
    const result = play(1, started.cfg.perm, started.cfg.unlocked, { loadout: started.cfg.loadout });
    const sync = await call(host.token, '/api/multi/sync', {
      code: created.room.code, cursor: 0, snapshot: { tick: 0, status: 'playing' }, actionStart: 0, actions: result.actions
    });
    ok(sync.ok && sync.requests.length === 1 && sync.requests[0].action.a === 'wave', 'líder recebe comando e envia o histórico por partes');
    db.prepare('UPDATE runs SET started = started - 600000 WHERE player IN (?, ?)')
      .run(host.playerId, guest.playerId);
    const finished = await call(host.token, '/api/multi/finish', { code: created.room.code });
    ok(finished.ok && Array.isArray(finished.team) && finished.team.length === 2, 'vitória é validada para os dois participantes');
    const hostProfile = await call(host.token, '/api/me');
    const guestProfile = await call(guest.token, '/api/me');
    ok(hostProfile.player.maxLevel === 1 && guestProfile.player.maxLevel === 1, 'progresso da fase é salvo nas duas contas');

    const solo = await login('c');
    const soloRoom = await call(solo.token, '/api/multi/create', {});
    ok(soloRoom.ok && soloRoom.room.players.length === 1, 'cria sala cooperativa solo');
    const soloStarted = await call(solo.token, '/api/multi/start', { code: soloRoom.room.code, level: 1 });
    ok(soloStarted.ok && soloStarted.room.status === 'playing', 'permite iniciar sala com apenas um jogador');
    const soloRun = play(1, soloStarted.cfg.perm, soloStarted.cfg.unlocked, { loadout: soloStarted.cfg.loadout });
    db.prepare('UPDATE runs SET started = started - 600000 WHERE player = ?').run(solo.playerId);
    const soloFinished = await call(solo.token, '/api/multi/finish', { code: soloRoom.room.code });
    ok(soloFinished.ok && soloFinished.team.length === 1 && soloFinished.team[0].ok, 'valida vitória de partida solo pelo modo multiplayer');
    const soloProfile = await call(solo.token, '/api/me');
    ok(soloProfile.player.maxLevel === 1, 'salva o progresso do jogador solo');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    srv.close();
  }
});
