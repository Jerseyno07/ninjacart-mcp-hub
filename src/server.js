import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

import { router as authRoutes } from './auth/routes.js';
import { verifyAccessToken } from './auth/tokenVerifier.js';
import { ensureAuthSchema } from './auth/db.js';
import { createMcpServer } from './mcp/mcpServer.js';
import { log } from './util/logger.js';

const app = express();
app.use(helmet());
app.use(cors());

const PORT = process.env.PORT || 3000;
const mcpServerUrl = new URL('/mcp', process.env.MCP_PUBLIC_URL);
const issuerUrl = new URL(process.env.MCP_PUBLIC_URL);

// Unauthenticated health check — Railway healthcheck target.
app.get('/health', (req, res) => res.json({ ok: true }));

// This server acts as its own authorization server (the Google broker in
// src/auth/routes.js) AND the MCP resource server, so we build the metadata
// by hand rather than using mcpAuthRouter (which expects a full
// OAuthServerProvider implementing authorize/exchangeAuthorizationCode/etc,
// which our routes.js intentionally doesn't conform to — see 02 - Auth & OAuth Flow.md).
const oauthMetadata = {
  issuer: issuerUrl.toString(),
  authorization_endpoint: new URL('/authorize', issuerUrl).toString(),
  token_endpoint: new URL('/token', issuerUrl).toString(),
  registration_endpoint: new URL('/register', issuerUrl).toString(),
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
};

app.use(mcpAuthMetadataRouter({
  oauthMetadata,
  resourceServerUrl: mcpServerUrl,
  scopesSupported: ['mcp'],
  resourceName: 'Ninjacart MCP Hub',
}));

// Our own broker's OAuth endpoints — /authorize, /oauth/callback, /token, /register.
app.use(authRoutes);

const authMiddleware = requireBearerAuth({
  verifier: { verifyAccessToken },
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

app.use('/mcp', express.json());

// One StreamableHTTPServerTransport (and one dedicated McpServer instance,
// see src/mcp/mcpServer.js) per MCP session.
const transports = {};

const mcpPostHandler = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  try {
    let transport;
    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) delete transports[sid];
      };
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null });
      return;
    }
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log('mcp_request_error', { message: err.message });
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
};

const mcpGetHandler = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
};

const mcpDeleteHandler = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
};

app.post('/mcp', authMiddleware, mcpPostHandler);
app.get('/mcp', authMiddleware, mcpGetHandler);
app.delete('/mcp', authMiddleware, mcpDeleteHandler);

// Creates oauth_clients/refresh_tokens tables if they don't exist yet —
// zero manual migration step on deploy, same pattern as knowledge/store.js.
ensureAuthSchema()
  .then(() => {
    app.listen(PORT, () => {
      log('server_started', { port: PORT });
    });
  })
  .catch((err) => {
    console.error('Failed to initialize auth schema:', err);
    process.exit(1);
  });
