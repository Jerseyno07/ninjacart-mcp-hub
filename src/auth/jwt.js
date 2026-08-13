import jwt from 'jsonwebtoken';

const SECRET = process.env.MCP_JWT_SECRET;
// Must match the resource URL checkResourceAllowed compares against in
// tokenVerifier.js (the /mcp endpoint itself, not just the public origin) —
// a mismatch here makes every token fail resource validation.
const AUDIENCE = new URL('/mcp', process.env.MCP_PUBLIC_URL).toString();

export function signAccessToken(email, role, projects, clientId) {
  return jwt.sign(
    { sub: email, role, projects, client_id: clientId, aud: AUDIENCE, scope: 'mcp' },
    SECRET,
    { expiresIn: '1h' },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, SECRET);
}
