import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI,
);

export function buildAuthUrl(state) {
  return client.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}

export async function exchangeCodeForTokens(code) {
  const { tokens } = await client.getToken(code);
  return tokens;
}

// Verifies the Google ID token and checks the account is on the allowed
// Workspace domain. `hd` (hosted domain) is only present for Workspace-
// federated logins, so `emailOk` is the fallback — a missing `hd` claim
// alone must not cause a false rejection.
export async function verifyIdTokenAndDomain(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  const allowedDomain = process.env.ALLOWED_GOOGLE_DOMAIN;
  const hdOk = payload.hd === allowedDomain;
  const emailOk = payload.email_verified &&
    payload.email.toLowerCase().endsWith('@' + allowedDomain);

  return { payload, domainAllowed: hdOk || emailOk };
}
