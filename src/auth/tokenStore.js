// In-memory Map + TTL sweep. Fine for short TTLs (minutes) and a single Railway
// instance — see README/CLAUDE.md for the single-replica tradeoff this implies.

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

// Dynamic Client Registration — registered MCP client apps. No TTL: a client
// stays registered for the life of the process.
export const registeredClients = new Map();

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
