import express from 'express';
import crypto from 'node:crypto';
import { buildAuthUrl, exchangeCodeForTokens, verifyIdTokenAndDomain } from './googleOAuth.js';
import { getRole } from './roles.js';
import { signAccessToken } from './jwt.js';
import {
  storePendingAuthorization, takePendingAuthorization,
  storeAuthorizationCode, takeAuthorizationCode,
  registeredClients,
} from './tokenStore.js';
import { log } from '../util/logger.js';

export const router = express.Router();

const ICONS = {
  info: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  error: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

// Official Google "G" mark, per Google's brand guidelines for sign-in buttons.
const GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.7-1.57 2.68-3.88 2.68-6.64z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.92-2.27c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.97 10.72c-.18-.54-.28-1.12-.28-1.72s.1-1.18.28-1.72V4.94H.96C.35 6.17 0 7.55 0 9s.35 2.83.96 4.06l3.01-2.34z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

function page(title, body, { icon = 'info' } = {}) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Ninjacart MCP Hub</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f3f4f6;
    color: #1f2937;
    min-height: 100vh;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }
  .card {
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08);
    max-width: 26rem;
    width: 100%;
    padding: 2rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 1.25rem;
  }
  .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: #2563eb; }
  .head { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem; }
  h1 { font-size: 1.25rem; font-weight: 700; margin: 0; color: #111827; }
  p { line-height: 1.55; color: #4b5563; margin: 0 0 0.5rem; }
  p:last-of-type { margin-bottom: 0; }
  code {
    background: #f3f4f6;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .google-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    margin-top: 1.5rem;
    padding: 0.65rem 1.1rem;
    background: #fff;
    color: #3c4043;
    font-size: 0.9rem;
    font-weight: 500;
    text-decoration: none;
    border: 1px solid #dadce0;
    border-radius: 8px;
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .google-btn:hover { box-shadow: 0 1px 6px rgba(0,0,0,0.12); border-color: #c6c9cc; }
</style>
</head><body>
  <div class="card">
    <div class="brand"><span class="brand-dot"></span>Ninjacart MCP Hub</div>
    <div class="head">${ICONS[icon] || ''}<h1>${title}</h1></div>
    ${body}
  </div>
</body></html>`;
}

function base64url(input) {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── GET /authorize ──────────────────────────────────────────────────────
// MCP client sends client_id, redirect_uri, code_challenge, code_challenge_method, state, resource.
router.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, code_challenge, code_challenge_method, state, resource } = req.query;

  const client = registeredClients.get(client_id);
  if (!client) {
    return res.status(400).send(page('Unknown client', '<p>This MCP client is not registered with this server. Ask it to register again.</p>', { icon: 'error' }));
  }
  if (code_challenge_method && code_challenge_method !== 'S256') {
    return res.status(400).send(page('Unsupported PKCE method', '<p>Only S256 code_challenge_method is supported.</p>', { icon: 'error' }));
  }

  const brokerState = crypto.randomBytes(24).toString('hex');
  storePendingAuthorization(brokerState, {
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    clientState: state,
    resource,
  });

  const googleUrl = buildAuthUrl(brokerState);

  res.send(page('Sign in required', `
    <p>This MCP server is restricted to Ninjacart team members. Sign in with your <strong>@ninjacart.com</strong> Google account to continue.</p>
    <a class="google-btn" href="${googleUrl}">${GOOGLE_G}Sign in with Google</a>
  `));
});

// ── GET /oauth/callback ─────────────────────────────────────────────────
// Google redirects back here with `code` + our `state`.
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(page('Sign-in cancelled', `<p>Google reported: ${error}</p>`, { icon: 'error' }));
  }

  const pending = takePendingAuthorization(state);
  if (!pending) {
    return res.status(400).send(page('Session expired', '<p>This login attempt has expired or was already used. Go back to your MCP client and try connecting again.</p>', { icon: 'error' }));
  }

  let payload, domainAllowed;
  try {
    const tokens = await exchangeCodeForTokens(code);
    ({ payload, domainAllowed } = await verifyIdTokenAndDomain(tokens.id_token));
  } catch (err) {
    log('oauth_callback_error', { message: err.message });
    return res.status(400).send(page('Sign-in failed', '<p>Something went wrong verifying your Google sign-in. Please try again.</p>', { icon: 'error' }));
  }

  if (!domainAllowed) {
    log('oauth_domain_rejected', { email: payload.email });
    return res.status(403).send(page('Access denied', `
      <p>You signed in as <code>${payload.email}</code>, but this server only allows @${process.env.ALLOWED_GOOGLE_DOMAIN} Google Workspace accounts.</p>
    `, { icon: 'error' }));
  }

  const roleEntry = getRole(payload.email);
  if (!roleEntry) {
    log('oauth_no_role_assigned', { email: payload.email });
    return res.status(403).send(page('Access denied', `
      <p>Your account isn't yet set up on this MCP server. Ask an admin to add you.</p>
    `, { icon: 'error' }));
  }

  const brokerCode = crypto.randomBytes(32).toString('hex');
  storeAuthorizationCode(brokerCode, {
    email: payload.email,
    role: roleEntry.role,
    projects: roleEntry.projects,
    clientId: pending.clientId,
    codeChallenge: pending.codeChallenge,
  });

  const redirectUrl = new URL(pending.redirectUri);
  redirectUrl.searchParams.set('code', brokerCode);
  if (pending.clientState) redirectUrl.searchParams.set('state', pending.clientState);

  log('oauth_login_success', { email: payload.email, role: roleEntry.role });
  res.redirect(redirectUrl.toString());
});

// ── POST /token ─────────────────────────────────────────────────────────
router.post('/token', express.urlencoded({ extended: false }), (req, res) => {
  const { grant_type, code, code_verifier } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const record = takeAuthorizationCode(code);
  if (!record) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Code is missing, expired, or already used.' });
  }

  const computedChallenge = base64url(crypto.createHash('sha256').update(code_verifier || '').digest());
  if (computedChallenge !== record.codeChallenge) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed.' });
  }

  const accessToken = signAccessToken(record.email, record.role, record.projects, record.clientId);
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
});

// ── POST /register (Dynamic Client Registration) ───────────────────────
router.post('/register', express.json(), (req, res) => {
  const { client_name, redirect_uris } = req.body;

  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required.' });
  }

  const clientId = crypto.randomUUID();
  const client = {
    client_id: clientId,
    client_name: client_name || 'MCP Client',
    redirect_uris,
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  registeredClients.set(clientId, client);

  res.status(201).json(client);
});
