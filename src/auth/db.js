import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.KNOWLEDGE_DATABASE_URL, max: 5 });

const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, sliding

// Creates the OAuth persistence tables if they don't exist yet. Called once
// at server startup (src/server.js) — no manual migration step on deploy.
// Same Neon DB as knowledge_chunks (KNOWLEDGE_DATABASE_URL), no new database.
export async function ensureAuthSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id VARCHAR(64) PRIMARY KEY,
      client_name VARCHAR(255) NOT NULL,
      redirect_uris JSONB NOT NULL,
      token_endpoint_auth_method VARCHAR(40) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token_hash VARCHAR(64) PRIMARY KEY,
      email VARCHAR(160) NOT NULL,
      client_id VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      replaced_by_hash VARCHAR(64)
    );
  `);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── OAuth client registry (replaces the old in-memory registeredClients Map) ──

export async function upsertClient(client) {
  await pool.query(
    `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, token_endpoint_auth_method)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (client_id) DO NOTHING`,
    [client.client_id, client.client_name, JSON.stringify(client.redirect_uris), client.token_endpoint_auth_method],
  );
}

export async function getClient(clientId) {
  const { rows } = await pool.query('SELECT * FROM oauth_clients WHERE client_id = $1', [clientId]);
  if (rows.length === 0) return undefined;
  const row = rows[0];
  return {
    client_id: row.client_id,
    client_name: row.client_name,
    redirect_uris: row.redirect_uris,
    token_endpoint_auth_method: row.token_endpoint_auth_method,
  };
}

// ── Refresh tokens ──────────────────────────────────────────────────────

// Generates a new opaque refresh token, stores its hash, returns the raw
// token (only ever returned here — never persisted in plaintext).
export async function issueRefreshToken(email, clientId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await pool.query(
    `INSERT INTO refresh_tokens (token_hash, email, client_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [hashToken(token), email, clientId, expiresAt],
  );
  return token;
}

// Validates a refresh token (exists, not expired, not revoked) and
// atomically rotates it: revokes the old one, issues + returns a new one
// alongside the email/clientId to reissue an access token for. Returns
// null if the token is missing/expired/revoked.
export async function consumeRefreshToken(token) {
  const tokenHash = hashToken(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT email, client_id, expires_at, revoked_at FROM refresh_tokens
       WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    if (rows.length === 0 || rows[0].revoked_at || rows[0].expires_at < new Date()) {
      await client.query('ROLLBACK');
      return null;
    }
    const { email, client_id: clientId } = rows[0];

    const newToken = crypto.randomBytes(48).toString('hex');
    const newHash = hashToken(newToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await client.query(
      `INSERT INTO refresh_tokens (token_hash, email, client_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [newHash, email, clientId, expiresAt],
    );
    await client.query(
      `UPDATE refresh_tokens SET revoked_at = now(), replaced_by_hash = $1 WHERE token_hash = $2`,
      [newHash, tokenHash],
    );
    await client.query('COMMIT');
    return { email, clientId, newRefreshToken: newToken };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(token) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)],
  );
}
