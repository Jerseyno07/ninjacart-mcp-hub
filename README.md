# Ninjacart MCP Hub

A remote MCP server, restricted to `@ninjacart.com` Google accounts plus a per-email role allowlist, that exposes read-only SQL access and knowledge-base search over Ninjacart project data — starting with PackTrack Pro, designed to grow into a hub for multiple projects behind one login.

Full build plan (auth flow, tool design, deployment): `~/.claude/plans/robust-sparking-music.md`.
Project notes/change log: [Ninjacart MCP Hub Obsidian vault](https://github.com/Jerseyno07/ninjacart-mcp-hub-notes).

## Status
Scaffolding only — directory structure and config files are in place; auth/MCP/tool implementation is in progress. See the notes vault's `05 - Change Log.md` for progress.

## Notable choices
- **ESM (`"type": "module"`), not CommonJS** — unlike PackTrack Pro. `@modelcontextprotocol/sdk` and its examples are ESM-first; this avoids interop friction.
- **In-memory `tokenStore`** (PKCE challenges, DCR clients) — fine for short TTLs on a single Railway instance, but resets on restart and won't work across >1 replica. Keep this service single-replica, or swap the backing store if that changes.
- **Hand-rolled Google OAuth broker**, not the MCP SDK's `ProxyOAuthServerProvider` shortcut — that shortcut has an open bug against Google (`modelcontextprotocol/typescript-sdk#1112`). This server runs the standard "Sign in with Google" flow itself instead.

## Adding a new project
1. `src/projects/<name>/index.js` exporting `register(mcpServer)`.
2. Its own DB/API client with its own credential env var (never share a pool with another project).
3. Its own query-guard-equivalent and `schema-context.md`.
4. Its own `notes/` folder, ingested with `node src/knowledge/ingest.js --project <name>`.
5. One new import line in `src/projects/registry.js`.

Nothing in `src/auth/*`, `src/mcp/mcpServer.js`, `src/knowledge/*`, or `src/server.js` needs to change.

## Granting a person access
Add/extend their entry in `src/auth/roles.js` (email → role + projects). Hand-edited, one-time-per-person, no admin UI at this scale.
