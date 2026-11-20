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
];

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
