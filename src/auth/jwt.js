import jwt from 'jsonwebtoken';

const SECRET = process.env.MCP_JWT_SECRET;
const AUDIENCE = process.env.MCP_PUBLIC_URL;

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
