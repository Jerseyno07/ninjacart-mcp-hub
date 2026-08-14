import { verifyAccessToken as verifyJwt } from './jwt.js';
import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const mcpServerUrl = new URL('/mcp', process.env.MCP_PUBLIC_URL);

// Passed as `verifier` to requireBearerAuth. Must throw InvalidTokenError
// (not a plain Error) on failure — requireBearerAuth only recognizes its own
// OAuthError subclasses and maps anything else to an opaque 500, which would
// defeat the "self-explanatory 401" requirement this exists to satisfy.
export async function verifyAccessToken(token) {
  let decoded;
  try {
    decoded = verifyJwt(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new InvalidTokenError('Access token expired - sign in again to get a new one.');
    }
    throw new InvalidTokenError('Invalid access token.');
  }

  if (!checkResourceAllowed({ requestedResource: decoded.aud, configuredResource: mcpServerUrl })) {
    throw new InvalidTokenError(`Access token was not issued for this server (expected resource ${mcpServerUrl}).`);
  }

  return {
    token,
    clientId: decoded.client_id,
    scopes: [decoded.scope],
    expiresAt: decoded.exp,
    extra: {
      email: decoded.sub,
      role: decoded.role,
      projects: decoded.projects,
    },
  };
}
