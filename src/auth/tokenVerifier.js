import { verifyAccessToken as verifyJwt } from './jwt.js';
import { checkResourceAllowed } from '@modelcontextprotocol/sdk/shared/auth-utils.js';

const mcpServerUrl = new URL('/mcp', process.env.MCP_PUBLIC_URL);

// Passed as `verifier` to requireBearerAuth. Throws a human-readable message
// on any failure (expired/invalid/wrong-audience) — requireBearerAuth surfaces
// that into the 401 body, which is what makes the login wall self-explanatory.
export async function verifyAccessToken(token) {
  let decoded;
  try {
    decoded = verifyJwt(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('Access token expired — sign in again to get a new one.');
    }
    throw new Error('Invalid access token.');
  }

  if (!checkResourceAllowed({ requestedResource: decoded.aud, configuredResource: mcpServerUrl })) {
    throw new Error(`Access token was not issued for this server (expected resource ${mcpServerUrl}).`);
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
