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

function page(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1a1a1a}
a.button{display:inline-block;margin-top:1rem;padding:0.6rem 1.2rem;background:#1a73e8;color:#fff;text-decoration:none;border-radius:6px}
</style></head><body><h1>${title}</h1>${body}</body></html>`;
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
    return res.status(400).send(page('Unknown client', '<p>This MCP client is not registered with this server. Ask it to register again.</p>'));
  }
  if (code_challenge_method && code_challenge_method !== 'S256') {
    return res.status(400).send(page('Unsupported PKCE method', '<p>Only S256 code_challenge_method is supported.</p>'));
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
    <a class="button" href="${googleUrl}">Sign in with Google</a>
  `));
});

// ── GET /oauth/callback ─────────────────────────────────────────────────
// Google redirects back here with `code` + our `state`.
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(page('Sign-in cancelled', `<p>Google reported: ${error}</p>`));
  }

  const pending = takePendingAuthorization(state);
  if (!pending) {
    return res.status(400).send(page('Session expired', '<p>This login attempt has expired or was already used. Go back to your MCP client and try connecting again.</p>'));
  }

  let payload, domainAllowed;
  try {
    const tokens = await exchangeCodeForTokens(code);
    ({ payload, domainAllowed } = await verifyIdTokenAndDomain(tokens.id_token));
  } catch (err) {
    log('oauth_callback_error', { message: err.message });
    return res.status(400).send(page('Sign-in failed', '<p>Something went wrong verifying your Google sign-in. Please try again.</p>'));
  }

  if (!domainAllowed) {
    log('oauth_domain_rejected', { email: payload.email });
    return res.status(403).send(page('Access denied', `
      <p>You signed in as <code>${payload.email}</code>, but this server only allows @${process.env.ALLOWED_GOOGLE_DOMAIN} Google Workspace accounts.</p>
    `));
  }

  const roleEntry = getRole(payload.email);
  if (!roleEntry) {
    log('oauth_no_role_assigned', { email: payload.email });
    return res.status(403).send(page('Access denied', `
      <p>Your account isn't yet set up on this MCP server. Ask an admin to add you.</p>
    `));
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
