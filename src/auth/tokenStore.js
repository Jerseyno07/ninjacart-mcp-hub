// In-memory Map + TTL sweep for short-lived (minutes), low-consequence state:
// pending Google logins and one-time authorization codes. Fine to lose on a
// restart (user just retries) — still single-Railway-instance-only, see
// README/CLAUDE.md. Longer-lived state (registered clients, refresh tokens)
// lives in Postgres instead — see db.js.

class TtlMap {
  constructor(sweepIntervalMs = 60_000) {
    this.map = new Map();
    setInterval(() => this.sweep(), sweepIntervalMs).unref();
  }

  set(key, value, ttlMs) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  delete(key) {
    this.map.delete(key);
  }

  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt < now) this.map.delete(key);
    }
  }
}

// Broker `state` (generated when we redirect to Google) -> the MCP client's
// original code_challenge/redirect_uri/state, while Google login is in flight.
export const pendingAuthorizations = new TtlMap();
const PENDING_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

// One-time broker authorization code -> email/role/projects + the client's
// PKCE/redirect info, ready to be exchanged at POST /token.
export const authorizationCodes = new TtlMap();
const AUTHORIZATION_CODE_TTL_MS = 2 * 60 * 1000;

// Dynamic Client Registration — registered MCP client apps now live in
// Postgres (src/auth/db.js: oauth_clients), not here, so they survive
// redeploys. See db.js's upsertClient/getClient.

export function storePendingAuthorization(state, record) {
  pendingAuthorizations.set(state, record, PENDING_AUTHORIZATION_TTL_MS);
}

export function takePendingAuthorization(state) {
  const record = pendingAuthorizations.get(state);
  if (record) pendingAuthorizations.delete(state);
  return record;
}

export function storeAuthorizationCode(code, record) {
  authorizationCodes.set(code, record, AUTHORIZATION_CODE_TTL_MS);
}

export function takeAuthorizationCode(code) {
  const record = authorizationCodes.get(code);
  if (record) authorizationCodes.delete(code); // one-time use
  return record;
}
