'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const Game = require('./game');

const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL não configurado. O Poker Arena não será iniciado.');
const PAID_ROOMS_ENABLED = process.env.PAID_ROOMS_ENABLED === 'true';
const RAKE_PERCENT = Math.max(0, Math.min(10, Number(process.env.RAKE_PERCENT || 5)));
const RAKE_CAP = Math.max(0, Math.floor(Number(process.env.RAKE_CAP || 100)));
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});
const app = express();
const rooms = new Map();
const clean = (v, max = 32) => String(v || '').replace(/[<>&"]/g, '').trim().slice(0, max);
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const randomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
};
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const send = (res, data, status = 200) => res.status(status).json(data);

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '32kb' }));
app.use('/api/', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false }));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poker_users (
      id text PRIMARY KEY,
      username text NOT NULL,
      username_key text NOT NULL UNIQUE,
      salt text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS poker_sessions (
      token_hash text PRIMARY KEY,
      player_id text NOT NULL REFERENCES poker_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS poker_wallets (
      player_id text PRIMARY KEY REFERENCES poker_users(id) ON DELETE CASCADE,
      free_tokens bigint NOT NULL DEFAULT 5000 CHECK (free_tokens >= 0),
      paid_tokens bigint NOT NULL DEFAULT 0 CHECK (paid_tokens >= 0),
      last_free_grant timestamptz
    );
    CREATE TABLE IF NOT EXISTS poker_wallet_ledger (
      id text PRIMARY KEY,
      player_id text NOT NULL REFERENCES poker_users(id) ON DELETE CASCADE,
      wallet_type text NOT NULL CHECK (wallet_type IN ('free','paid')),
      amount bigint NOT NULL,
      reason text NOT NULL,
      reference text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS poker_tables (
      id text PRIMARY KEY,
      code text NOT NULL UNIQUE,
      owner_id text NOT NULL REFERENCES poker_users(id),
      status text NOT NULL,
      mode text NOT NULL CHECK (mode IN ('free','paid')),
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS poker_tables_status_idx ON poker_tables(status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS poker_house_ledger (
      id bigserial PRIMARY KEY,
      table_id text NOT NULL,
      hand_no integer NOT NULL,
      rake_tokens bigint NOT NULL CHECK (rake_tokens >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(table_id, hand_no)
    );
  `);
  const { rows } = await pool.query("SELECT id, state FROM poker_tables WHERE status <> 'closed' AND updated_at > now() - interval '12 hours'");
  for (const row of rows) {
    const room = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
    if (room && room.id) rooms.set(room.id, room);
  }
}
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
async function walletFor(playerId, client = pool) {
  const { rows } = await client.query(
    'SELECT free_tokens, paid_tokens, last_free_grant FROM poker_wallets WHERE player_id=$1',
    [playerId]
  );
  return rows[0] || { free_tokens: 0, paid_tokens: 0, last_free_grant: null };
}
async function ledger(client, playerId, walletType, amount, reason, reference) {
  await client.query(
    'INSERT INTO poker_wallet_ledger(id,player_id,wallet_type,amount,reason,reference) VALUES($1,$2,$3,$4,$5,$6)',
    [crypto.randomUUID(), playerId, walletType, amount, reason, reference || null]
  );
}
async function createSession(client, playerId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await client.query(
    'INSERT INTO poker_sessions(token_hash,player_id,expires_at) VALUES($1,$2,now()+interval \'30 days\')',
    [hash(token), playerId]
  );
  return token;
}
async function saveRoom(room) {
  room.updatedAt = Date.now();
  await pool.query(
    `INSERT INTO poker_tables(id,code,owner_id,status,mode,state,updated_at)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,now())
     ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status, state=EXCLUDED.state, updated_at=now()`,
    [room.id, room.code, room.ownerId, room.status, room.mode, JSON.stringify(room)]
  );
}
async function getRoom(idOrCode) {
  for (const room of rooms.values()) if (room.id === idOrCode || room.code === String(idOrCode).toUpperCase()) return room;
  const { rows } = await pool.query('SELECT state FROM poker_tables WHERE id=$1 OR code=$1 LIMIT 1', [idOrCode]);
  if (!rows[0]) return null;
  const room = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
  rooms.set(room.id, room);
  return room;
}
async function auth(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token.length < 32) return send(res, { error: 'Entre na sua conta para continuar.' }, 401);
    const { rows } = await pool.query(
      `SELECT u.id, u.username FROM poker_sessions s
       JOIN poker_users u ON u.id=s.player_id
       WHERE s.token_hash=$1 AND s.expires_at > now()`,
      [hash(token)]
    );
    if (!rows[0]) return send(res, { error: 'Sessão expirada. Entre novamente.' }, 401);
    req.user = rows[0];
    next();
  } catch (e) { next(e); }
}
function roomSeat(room, playerId) {
  return room.seats.find(s => s.playerId === playerId && !s.left) || null;
}
async function refundSeat(room, seat) {
  if (!seat || seat.left) return;
  const amount = Math.max(0, Math.floor(seat.stack));
  if (amount) {
    await withTx(async client => {
      await client.query('UPDATE poker_wallets SET free_tokens=free_tokens+$2 WHERE player_id=$1', [seat.playerId, amount]);
      await ledger(client, seat.playerId, 'free', amount, 'cashout_mesa', room.id + ':' + room.handNo + ':' + seat.id);
    });
  }
  seat.left = true;
  seat.leaveAfterHand = false;
  if (room.seats.every(s => s.left)) room.status = 'closed';
  await saveRoom(room);
}
async function finishDepartures(room) {
  if (!room.hand || room.hand.stage !== 'complete') return;
  const leaving = room.seats.filter(s => !s.left && s.leaveAfterHand);
  for (const seat of leaving) await refundSeat(room, seat);
}
async function recordRake(room) {
  const h = room.hand;
  if (!h || !h.result || !h.result.rake) return;
  await pool.query(
    'INSERT INTO poker_house_ledger(table_id,hand_no,rake_tokens) VALUES($1,$2,$3) ON CONFLICT(table_id,hand_no) DO NOTHING',
    [room.id, h.handNo, h.result.rake]
  );
}
async function runHousekeeping(room) {
  if (room.status === 'playing' && room.hand && room.hand.currentPlayer) {
    const seat = room.seats.find(s => s.id === room.hand.currentPlayer);
    if (seat && Date.now() - room.hand.startedAt > 30000) {
      Game.applyAction(room, seat.playerId, { type: room.hand.currentBet > seat.streetBet ? 'fold' : 'check' });
      if (room.hand.stage === 'complete') {
        await recordRake(room);
        await finishDepartures(room);
      }
      await saveRoom(room);
    }
  }
  if (room.status === 'waiting' && room.hand && room.hand.stage === 'complete' && room.nextHandAt && Date.now() >= room.nextHandAt) {
    const active = room.seats.filter(s => !s.left && s.stack > 0);
    if (active.length >= 2) Game.startHand(room);
    else room.nextHandAt = null;
    await saveRoom(room);
  }
}
function publicTable(room, playerId) {
  const out = Game.publicRoom(room, playerId);
  out.isSeated = !!roomSeat(room, playerId);
  return out;
}
function publicWallet(wallet) {
  return {
    freeTokens: Number(wallet.free_tokens || 0),
    paidTokens: Number(wallet.paid_tokens || 0),
    paidRoomsEnabled: PAID_ROOMS_ENABLED
  };
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'poker-arena', database: 'connected', paidRoomsEnabled: PAID_ROOMS_ENABLED }));

app.post('/api/register', asyncRoute(async (req, res) => {
  const username = clean(req.body.username, 18);
  const usernameKey = username.toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[A-Za-z0-9_]{3,18}$/.test(username)) return send(res, { error: 'Use um nome de 3 a 18 caracteres: letras, números ou _.' }, 400);
  if (password.length < 8 || password.length > 128) return send(res, { error: 'A senha precisa ter de 8 a 128 caracteres.' }, 400);
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    const result = await withTx(async client => {
      const id = crypto.randomUUID();
      await client.query(
        'INSERT INTO poker_users(id,username,username_key,salt,password_hash) VALUES($1,$2,$3,$4,$5)',
        [id, username, usernameKey, salt, passwordHash]
      );
      await client.query('INSERT INTO poker_wallets(player_id,free_tokens,paid_tokens) VALUES($1,5000,0)', [id]);
      await ledger(client, id, 'free', 5000, 'bonus_inicial', id);
      return { id, token: await createSession(client, id) };
    });
    const wallet = await walletFor(result.id);
    send(res, { ok: true, token: result.token, user: { id: result.id, username }, wallet: publicWallet(wallet) }, 201);
  } catch (e) {
    if (e.code === '23505') return send(res, { error: 'Esse nome já está em uso. Escolha outro.' }, 409);
    throw e;
  }
}));
app.post('/api/login', asyncRoute(async (req, res) => {
  const usernameKey = clean(req.body.username, 18).toLowerCase();
  const password = String(req.body.password || '');
  const { rows } = await pool.query('SELECT id,username,salt,password_hash FROM poker_users WHERE username_key=$1', [usernameKey]);
  const user = rows[0];
  if (!user) return send(res, { error: 'Usuário ou senha incorretos.' }, 401);
  const actual = crypto.scryptSync(password, user.salt, 64);
  const expected = Buffer.from(user.password_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return send(res, { error: 'Usuário ou senha incorretos.' }, 401);
  }
  const token = await createSession(pool, user.id);
  const wallet = await walletFor(user.id);
  send(res, { ok: true, token, user: { id: user.id, username: user.username }, wallet: publicWallet(wallet) });
}));
app.get('/api/me', auth, asyncRoute(async (req, res) => {
  const wallet = await walletFor(req.user.id);
  send(res, { ok: true, user: req.user, wallet: publicWallet(wallet) });
}));
app.post('/api/wallet/claim', auth, asyncRoute(async (req, res) => {
  const result = await withTx(async client => {
    const { rows } = await client.query('SELECT free_tokens,last_free_grant FROM poker_wallets WHERE player_id=$1 FOR UPDATE', [req.user.id]);
    const wallet = rows[0];
    if (wallet.last_free_grant && Date.now() - new Date(wallet.last_free_grant).getTime() < 86400000) {
      return { error: 'Você já pegou seu bônus gratuito nas últimas 24 horas.' };
    }
    const add = Math.max(0, Math.min(1000, 5000 - Number(wallet.free_tokens)));
    if (!add) return { error: 'Seu saldo gratuito já está cheio.' };
    await client.query('UPDATE poker_wallets SET free_tokens=free_tokens+$2,last_free_grant=now() WHERE player_id=$1', [req.user.id, add]);
    await ledger(client, req.user.id, 'free', add, 'bonus_diario', new Date().toISOString().slice(0,10));
    return { added: add };
  });
  if (result.error) return send(res, result, 400);
  send(res, { ok: true, added: result.added, wallet: publicWallet(await walletFor(req.user.id)) });
}));

app.get('/api/tables', auth, asyncRoute(async (req, res) => {
  const list = [];
  for (const room of rooms.values()) {
    await runHousekeeping(room);
    if (room.mode !== 'free' || room.status === 'closed') continue;
    if (room.private) continue;
    list.push({
      id: room.id, name: room.name, players: room.seats.filter(s=>!s.left).length,
      maxPlayers: room.maxPlayers, buyIn: room.buyIn,
      blinds: room.smallBlind + '/' + room.bigBlind, status: room.status
    });
  }
  send(res, { ok: true, tables: list.sort((a,b)=>b.players-a.players) });
}));
app.post('/api/tables', auth, asyncRoute(async (req, res) => {
  const name = clean(req.body.name || 'Mesa aberta', 28) || 'Mesa aberta';
  const buyIn = Math.floor(Number(req.body.buyIn || 500));
  const maxPlayers = Math.max(2, Math.min(6, Math.floor(Number(req.body.maxPlayers || 6))));
  const isPrivate = !!req.body.private;
  if (!Number.isInteger(buyIn) || buyIn < 200 || buyIn > 2000) return send(res, { error: 'A entrada deve ficar entre 200 e 2.000 fichas gratuitas.' }, 400);
  const id = crypto.randomUUID();
  let code = randomCode();
  while ((await pool.query('SELECT 1 FROM poker_tables WHERE code=$1', [code])).rowCount) code = randomCode();
  const room = Game.freshRoom({
    id, code, ownerId: req.user.id, ownerName: req.user.username, name, maxPlayers, buyIn,
    smallBlind: Math.max(1, Math.floor(buyIn / 100)), bigBlind: Math.max(2, Math.floor(buyIn / 50)), mode: 'free'
  });
  room.private = isPrivate;
  const created = await withTx(async client => {
    const debit = await client.query(
      'UPDATE poker_wallets SET free_tokens=free_tokens-$2 WHERE player_id=$1 AND free_tokens >= $2 RETURNING free_tokens',
      [req.user.id, buyIn]
    );
    if (!debit.rowCount) return false;
    await ledger(client, req.user.id, 'free', -buyIn, 'entrada_mesa', id);
    await client.query(
      'INSERT INTO poker_tables(id,code,owner_id,status,mode,state) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
      [room.id, room.code, room.ownerId, room.status, room.mode, JSON.stringify(room)]
    );
    return true;
  });
  if (!created) return send(res, { error: 'Saldo gratuito insuficiente para entrar nessa mesa.' }, 400);
  rooms.set(room.id, room);
  send(res, { ok: true, table: publicTable(room, req.user.id), wallet: publicWallet(await walletFor(req.user.id)) }, 201);
}));
app.post('/api/tables/join', auth, asyncRoute(async (req, res) => {
  const key = clean(req.body.code || req.body.id, 12).toUpperCase();
  const room = await getRoom(key);
  if (!room || room.status === 'closed') return send(res, { error: 'Mesa não encontrada.' }, 404);
  if (room.mode !== 'free') return send(res, { error: 'Mesas premium estão temporariamente desativadas.' }, 403);
  if (room.status === 'playing') return send(res, { error: 'A mão já começou. Aguarde a próxima mesa.' }, 400);
  const buyIn = Math.floor(Number(req.body.buyIn || room.buyIn));
  if (room.seats.some(s=>s.playerId===req.user.id&&!s.left)) return send(res, { error: 'Você já está nesta mesa.' }, 409);
  if (room.seats.filter(s=>!s.left).length >= room.maxPlayers) return send(res, { error: 'Mesa cheia.' }, 400);
  const result = await withTx(async client => {
    const debit = await client.query(
      'UPDATE poker_wallets SET free_tokens=free_tokens-$2 WHERE player_id=$1 AND free_tokens >= $2 RETURNING free_tokens',
      [req.user.id, buyIn]
    );
    if (!debit.rowCount) return { error: 'Saldo gratuito insuficiente.' };
    const joined = Game.addSeat(room, req.user.id, req.user.username, buyIn);
    if (joined.error) return joined;
    await ledger(client, req.user.id, 'free', -buyIn, 'entrada_mesa', room.id + ':' + room.handNo);
    await client.query(
      'UPDATE poker_tables SET state=$2::jsonb,updated_at=now() WHERE id=$1',
      [room.id, JSON.stringify(room)]
    );
    return { ok: true };
  });
  if (result.error) return send(res, result, 400);
  if (room.seats.filter(s=>!s.left&&s.stack>0).length >= 2) Game.startHand(room);
  await saveRoom(room);
  send(res, { ok: true, table: publicTable(room, req.user.id), wallet: publicWallet(await walletFor(req.user.id)) });
}));
app.get('/api/tables/:id', auth, asyncRoute(async (req, res) => {
  const room = await getRoom(req.params.id);
  if (!room) return send(res, { error: 'Mesa não encontrada.' }, 404);
  await runHousekeeping(room);
  if (!roomSeat(room, req.user.id)) return send(res, { error: 'Você não está sentado nesta mesa.' }, 403);
  send(res, { ok: true, table: publicTable(room, req.user.id), wallet: publicWallet(await walletFor(req.user.id)) });
}));
app.post('/api/tables/:id/action', auth, asyncRoute(async (req, res) => {
  const room = await getRoom(req.params.id);
  if (!room || !roomSeat(room, req.user.id)) return send(res, { error: 'Você não está nesta mesa.' }, 404);
  const out = Game.applyAction(room, req.user.id, req.body || {});
  if (out.error) return send(res, out, 400);
  if (out.finished && out.result && out.result.rake) await recordRake(room);
  await finishDepartures(room);
  await saveRoom(room);
  send(res, { ok: true, table: publicTable(room, req.user.id) });
}));
app.post('/api/tables/:id/leave', auth, asyncRoute(async (req, res) => {
  const room = await getRoom(req.params.id);
  if (!room) return send(res, { ok: true });
  const seat = roomSeat(room, req.user.id);
  if (!seat) return send(res, { ok: true });
  if (room.status === 'playing' && room.hand && room.hand.stage !== 'complete') {
    seat.leaveAfterHand = true;
    if (room.hand.currentPlayer === seat.id && !seat.allIn) {
      const out = Game.applyAction(room, req.user.id, { type: 'fold' });
      if (out.finished && out.result?.rake) await recordRake(room);
      await finishDepartures(room);
    }
    await saveRoom(room);
    return send(res, { ok: true, message: 'Você sairá após esta mão.' });
  }
  await refundSeat(room, seat);
  send(res, { ok: true, wallet: publicWallet(await walletFor(req.user.id)) });
}));
app.post('/api/tables/:id/rebuy', auth, asyncRoute(async (req, res) => {
  const room = await getRoom(req.params.id);
  if (!room || !roomSeat(room, req.user.id)) return send(res, { error: 'Você não está nesta mesa.' }, 404);
  if (room.status === 'playing') return send(res, { error: 'Aguarde o final da mão para recomprar.' }, 400);
  const seat = roomSeat(room, req.user.id);
  if (seat.stack > 0) return send(res, { error: 'Você ainda tem fichas na mesa.' }, 400);
  const amount = room.buyIn;
  const debit = await pool.query(
    'UPDATE poker_wallets SET free_tokens=free_tokens-$2 WHERE player_id=$1 AND free_tokens >= $2 RETURNING free_tokens',
    [req.user.id, amount]
  );
  if (!debit.rowCount) return send(res, { error: 'Saldo gratuito insuficiente.' }, 400);
  await ledger(pool, req.user.id, 'free', -amount, 'recompra_mesa', room.id + ':' + room.handNo);
  seat.stack = amount;
  if (room.seats.filter(s=>!s.left&&s.stack>0).length >= 2) Game.startHand(room);
  await saveRoom(room);
  send(res, { ok: true, table: publicTable(room, req.user.id), wallet: publicWallet(await walletFor(req.user.id)) });
}));
app.get('/api/premium/status', auth, (req, res) => {
  send(res, {
    ok: true, enabled: PAID_ROOMS_ENABLED,
    message: PAID_ROOMS_ENABLED
      ? 'Salas premium liberadas por configuração do operador.'
      : 'Compra de fichas premium, apostas pagas e comissão estão desativadas até a validação jurídica e a configuração do meio de pagamento.'
  });
});
app.post('/api/premium/buy', auth, (req, res) => send(res, { error: 'Compras de fichas premium ainda não estão habilitadas.' }, 503));
app.post('/api/premium/tables', auth, (req, res) => send(res, { error: 'Salas com fichas pagas ainda não estão habilitadas.' }, 503));

app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, file) {
    if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  console.error('[poker]', err && err.message ? err.message : err);
  if (res.headersSent) return next(err);
  send(res, { error: 'Falha interna. Tente novamente.' }, 500);
});

async function main() {
  await initDb();
  app.listen(PORT, () => console.log('Poker Arena iniciado na porta ' + PORT));
}
if (require.main === module) main().catch(err => { console.error('Falha ao iniciar Poker Arena:', err); process.exit(1); });
module.exports = { app, pool, initDb, rooms };
