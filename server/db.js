/*
 * ARMAZENAMENTO DAS CONTAS
 *  - Produção: Postgres na nuvem (defina DATABASE_URL). Nada se perde quando o servidor reinicia.
 *  - Testes/desenvolvimento: SQLite (arquivo local ou memória).
 * Todas as alterações do jogador acontecem dentro de TRANSAÇÕES (sem duplicar compras nem perder progresso).
 */
'use strict';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, data TEXT NOT NULL, created BIGINT, banned INTEGER DEFAULT 0, cheats INTEGER DEFAULT 0)`,
  // formas de entrar na conta: device (aparelho), google (conta Google), code (código de recuperação)
  `CREATE TABLE IF NOT EXISTS identities (kind TEXT NOT NULL, key TEXT NOT NULL, player TEXT NOT NULL, created BIGINT, PRIMARY KEY (kind, key))`,
  `CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, player TEXT, cfg TEXT, started BIGINT, done INTEGER DEFAULT 0)`,
  // TODAS as compras (Google Play, PIX, cartão) ficam registradas aqui, ligadas à conta
  `CREATE TABLE IF NOT EXISTS purchases (token TEXT PRIMARY KEY, player TEXT, product TEXT, order_id TEXT, at BIGINT, state TEXT, test INTEGER, provider TEXT, amount TEXT)`,
  // configurações ao vivo do jogo (editadas no painel do mestre)
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS auth_challenges (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL, player TEXT NOT NULL, secret_hash TEXT NOT NULL, expires BIGINT NOT NULL, attempts INTEGER DEFAULT 0)`,
];
const brief = (r) => { const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; return { id: r.id, name: d.name, email: d.email || null, maxLevel: d.maxLevel | 0, coins: d.coins | 0, gems: d.gems | 0, created: Number(r.created), banned: !!Number(r.banned), cheats: Number(r.cheats) | 0 }; };

/* ------------------------------ SQLite ------------------------------ */
function sqliteStore(file) {
  const Database = require('better-sqlite3');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  for (const sql of SCHEMA) db.exec(sql);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  return {
    kind: 'sqlite', raw: db,
    async init() {},
    async findIdentity(kind, key) { const r = one('SELECT player FROM identities WHERE kind = ? AND key = ?', kind, key); return r ? r.player : null; },
    async setIdentity(kind, key, player) { run('INSERT OR REPLACE INTO identities (kind, key, player, created) VALUES (?, ?, ?, ?)', kind, key, player, Date.now()); },
    async removeIdentities(kind, player) { run('DELETE FROM identities WHERE kind = ? AND player = ?', kind, player); },
    async identitiesOf(player) { return db.prepare('SELECT kind, key FROM identities WHERE player = ?').all(player); },
    async createChallenge(x) { run('INSERT INTO auth_challenges (id, kind, target, player, secret_hash, expires, attempts) VALUES (?, ?, ?, ?, ?, ?, 0)', x.id, x.kind, x.target, x.player, x.secretHash, x.expires); },
    async getChallenge(id) { return one('SELECT * FROM auth_challenges WHERE id = ?', id) || null; },
    async updateChallengeAttempts(id, attempts) { run('UPDATE auth_challenges SET attempts = ? WHERE id = ?', attempts, id); },
    async deleteChallenge(id) { run('DELETE FROM auth_challenges WHERE id = ?', id); },
    async createPlayer(id, data) { run('INSERT INTO players (id, data, created) VALUES (?, ?, ?)', id, JSON.stringify(data), Date.now()); },
    async getPlayer(id) { const r = one('SELECT * FROM players WHERE id = ?', id); return r ? Object.assign(r, { data: JSON.parse(r.data) }) : null; },
    // fn(p) é síncrona: altera o jogador; se não retornar erro, salva tudo junto
    async withPlayer(id, fn) {
      return db.transaction(() => {
        const r = one('SELECT * FROM players WHERE id = ?', id);
        if (!r) return { error: 'Conta não encontrada' };
        const p = JSON.parse(r.data);
        const out = fn(p, r) || {};
        if (!out.error) run('UPDATE players SET data = ? WHERE id = ?', JSON.stringify(p), id);
        out.__p = p;
        return out;
      })();
    },
    async addCheat(id) { run('UPDATE players SET cheats = cheats + 1, banned = CASE WHEN cheats + 1 >= 5 THEN 1 ELSE banned END WHERE id = ?', id); },
    async insertRun(id, player, cfg) { run('UPDATE runs SET done = 1 WHERE player = ? AND done = 0', player); run('INSERT INTO runs (id, player, cfg, started) VALUES (?, ?, ?, ?)', id, player, JSON.stringify(cfg), Date.now()); },
    // pega a partida e marca como encerrada (só funciona 1 vez)
    async takeRun(id, player) {
      return db.transaction(() => {
        const r = one('SELECT * FROM runs WHERE id = ? AND player = ? AND done = 0', id, player);
        if (!r) return null;
        run('UPDATE runs SET done = 1 WHERE id = ?', id);
        return Object.assign(r, { cfg: JSON.parse(r.cfg) });
      })();
    },
    async getPurchase(token) { return one('SELECT * FROM purchases WHERE token = ?', token) || null; },
    async getPurchaseByOrder(order) { return one('SELECT * FROM purchases WHERE order_id = ?', order) || null; },
    async insertPurchase(x) {
      try { run('INSERT INTO purchases (token, player, product, order_id, at, state, test, provider, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', x.token, x.player, x.product, x.order_id || null, Date.now(), x.state, x.test ? 1 : 0, x.provider, String(x.amount || '')); return true; }
      catch (e) { return false; }
    },
    // muda o estado só se estiver no estado esperado (evita entregar 2 vezes)
    async swapPurchaseState(token, from, to) { return run('UPDATE purchases SET state = ? WHERE token = ? AND state = ?', to, token, from).changes === 1; },
    async purchasesOf(player) { return db.prepare('SELECT token, product, at, state, provider, amount FROM purchases WHERE player = ? ORDER BY at DESC LIMIT 50').all(player); },
    // ----- painel do mestre -----
    async getSetting(k) { const r = one('SELECT value FROM settings WHERE key = ?', k); return r ? JSON.parse(r.value) : null; },
    async setSetting(k, v) { run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v)); },
    async setBanned(id, v) { run('UPDATE players SET banned = ?, cheats = CASE WHEN ? = 0 THEN 0 ELSE cheats END WHERE id = ?', v ? 1 : 0, v ? 1 : 0, id); },
    async listPlayers(q, limit) {
      const like = '%' + String(q || '').toLowerCase() + '%';
      return db.prepare('SELECT * FROM players WHERE ? = \'%%\' OR lower(id) LIKE ? OR lower(data) LIKE ? ORDER BY created DESC LIMIT ?').all(like, like, like, limit).map(brief);
    },
    async allPurchases(limit) { return db.prepare('SELECT player, product, at, state, provider, amount FROM purchases ORDER BY at DESC LIMIT ?').all(limit); },
    async stats(since) {
      return { players: one('SELECT COUNT(*) n FROM players').n, newPlayers: one('SELECT COUNT(*) n FROM players WHERE created >= ?', since).n,
        sales: one("SELECT COUNT(*) n, COALESCE(SUM(CAST(amount AS REAL)), 0) s FROM purchases WHERE state = 'ok'"),
        salesToday: one("SELECT COUNT(*) n, COALESCE(SUM(CAST(amount AS REAL)), 0) s FROM purchases WHERE state = 'ok' AND at >= ?", since),
        banned: one('SELECT COUNT(*) n FROM players WHERE banned = 1').n };
    },
  };
}

/* ------------------------------ Postgres ------------------------------ */
function pgStore(pool) {
  const q = (sql, a) => pool.query(sql, a);
  return {
    kind: 'postgres', raw: pool,
    async init() { for (const sql of SCHEMA) await q(sql); },
    async findIdentity(kind, key) { const r = await q('SELECT player FROM identities WHERE kind = $1 AND key = $2', [kind, key]); return r.rows[0] ? r.rows[0].player : null; },
    async setIdentity(kind, key, player) {
      await q('DELETE FROM identities WHERE kind = $1 AND key = $2', [kind, key]);
      await q('INSERT INTO identities (kind, key, player, created) VALUES ($1, $2, $3, $4)', [kind, key, player, Date.now()]);
    },
    async removeIdentities(kind, player) { await q('DELETE FROM identities WHERE kind = $1 AND player = $2', [kind, player]); },
    async identitiesOf(player) { return (await q('SELECT kind, key FROM identities WHERE player = $1', [player])).rows; },
    async createChallenge(x) { await q('INSERT INTO auth_challenges (id, kind, target, player, secret_hash, expires, attempts) VALUES ($1, $2, $3, $4, $5, $6, 0)', [x.id, x.kind, x.target, x.player, x.secretHash, x.expires]); },
    async getChallenge(id) { return (await q('SELECT * FROM auth_challenges WHERE id = $1', [id])).rows[0] || null; },
    async updateChallengeAttempts(id, attempts) { await q('UPDATE auth_challenges SET attempts = $1 WHERE id = $2', [attempts, id]); },
    async deleteChallenge(id) { await q('DELETE FROM auth_challenges WHERE id = $1', [id]); },
    async createPlayer(id, data) { await q('INSERT INTO players (id, data, created) VALUES ($1, $2, $3)', [id, JSON.stringify(data), Date.now()]); },
    async getPlayer(id) { const r = (await q('SELECT * FROM players WHERE id = $1', [id])).rows[0]; return r ? Object.assign(r, { data: JSON.parse(r.data) }) : null; },
    async withPlayer(id, fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = (await c.query('SELECT * FROM players WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!r) { await c.query('ROLLBACK'); return { error: 'Conta não encontrada' }; }
        const p = JSON.parse(r.data);
        const out = fn(p, r) || {};
        if (!out.error) await c.query('UPDATE players SET data = $1 WHERE id = $2', [JSON.stringify(p), id]);
        await c.query('COMMIT');
        out.__p = p;
        return out;
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
      finally { c.release(); }
    },
    async addCheat(id) { await q('UPDATE players SET cheats = cheats + 1, banned = CASE WHEN cheats + 1 >= 5 THEN 1 ELSE banned END WHERE id = $1', [id]); },
    async insertRun(id, player, cfg) {
      await q('UPDATE runs SET done = 1 WHERE player = $1 AND done = 0', [player]);
      await q('INSERT INTO runs (id, player, cfg, started) VALUES ($1, $2, $3, $4)', [id, player, JSON.stringify(cfg), Date.now()]);
    },
    async takeRun(id, player) {
      const r = (await q('UPDATE runs SET done = 1 WHERE id = $1 AND player = $2 AND done = 0 RETURNING *', [id, player])).rows[0];
      return r ? Object.assign(r, { cfg: JSON.parse(r.cfg), started: Number(r.started) }) : null;
    },
    async getPurchase(token) { return (await q('SELECT * FROM purchases WHERE token = $1', [token])).rows[0] || null; },
    async getPurchaseByOrder(order) { return (await q('SELECT * FROM purchases WHERE order_id = $1', [order])).rows[0] || null; },
    async insertPurchase(x) {
      try { await q('INSERT INTO purchases (token, player, product, order_id, at, state, test, provider, amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [x.token, x.player, x.product, x.order_id || null, Date.now(), x.state, x.test ? 1 : 0, x.provider, String(x.amount || '')]); return true; }
      catch (e) { if (e.code === '23505' || /duplicate|unique/i.test(e.message)) return false; throw e; }
    },
    async swapPurchaseState(token, from, to) { return (await q('UPDATE purchases SET state = $1 WHERE token = $2 AND state = $3 RETURNING token', [to, token, from])).rows.length === 1; },
    async purchasesOf(player) { return (await q('SELECT token, product, at, state, provider, amount FROM purchases WHERE player = $1 ORDER BY at DESC LIMIT 50', [player])).rows; },
    // ----- painel do mestre -----
    async getSetting(k) { const r = (await q('SELECT value FROM settings WHERE key = $1', [k])).rows[0]; return r ? JSON.parse(r.value) : null; },
    async setSetting(k, v) { await q('DELETE FROM settings WHERE key = $1', [k]); await q('INSERT INTO settings (key, value) VALUES ($1, $2)', [k, JSON.stringify(v)]); },
    async setBanned(id, v) { await q('UPDATE players SET banned = $1, cheats = CASE WHEN $1 = 0 THEN 0 ELSE cheats END WHERE id = $2', [v ? 1 : 0, id]); },
    async listPlayers(qs, limit) {
      const like = '%' + String(qs || '').toLowerCase() + '%';
      return (await q("SELECT * FROM players WHERE $1 = '%%' OR lower(id) LIKE $1 OR lower(data) LIKE $1 ORDER BY created DESC LIMIT $2", [like, limit])).rows.map(brief);
    },
    async allPurchases(limit) { return (await q('SELECT player, product, at, state, provider, amount FROM purchases ORDER BY at DESC LIMIT $1', [limit])).rows; },
    async stats(since) {
      const n = async (sql, a) => Number((await q(sql, a)).rows[0].n);
      const sum = async (sql, a) => { const r = (await q(sql, a)).rows[0]; return { n: Number(r.n), s: Number(r.s) }; };
      return { players: await n('SELECT COUNT(*) n FROM players'), newPlayers: await n('SELECT COUNT(*) n FROM players WHERE created >= $1', [since]),
        sales: await sum("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN amount IS NULL OR amount = '' THEN 0 ELSE CAST(amount AS NUMERIC) END), 0) s FROM purchases WHERE state = 'ok'"),
        salesToday: await sum("SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN amount IS NULL OR amount = '' THEN 0 ELSE CAST(amount AS NUMERIC) END), 0) s FROM purchases WHERE state = 'ok' AND at >= $1", [since]),
        banned: await n('SELECT COUNT(*) n FROM players WHERE banned = 1') };
    },
  };
}

function createStore() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const ssl = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false };
    return pgStore(new Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 10 }));
  }
  const path = require('path');
  return sqliteStore(process.env.DB_PATH || path.join(__dirname, 'data.db'));
}

module.exports = { createStore, sqliteStore, pgStore };
