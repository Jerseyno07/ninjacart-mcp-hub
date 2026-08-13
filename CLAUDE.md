# Ninjacart MCP Hub — Claude Instructions

## Server timezone is always UTC

Railway (and Node.js) run in UTC. `new Date()` always returns UTC time.
IST is UTC+5:30, so midnight IST = 18:30 UTC the *previous* calendar day.

**Rule:** Any code that computes a calendar date for IST must apply the offset:
```js
const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
const dateStr = nowIst.toISOString().slice(0, 10); // correct IST date
```

**Also:** PostgreSQL `date` columns come back from `pg` as JS Date objects at midnight
local system time — same pitfall as PackTrack Pro's own `CLAUDE.md`, and directly relevant
here since `query_packtrack_db` hits the same Neon database. Apply the IST offset (or cast
to `::text` in SQL) before slicing `.toISOString()`.

## Always log changes to git and Obsidian

After every session that makes changes, ensure:
1. All changes are committed and pushed to `main` (both this repo and the notes repo below, if notes changed)
2. Obsidian changelog (`~/Documents/ninjacart-mcp-hub/Ninjacart MCP Hub/05 - Change Log.md`) is updated

If the user ends the session without explicitly asking to log, do it anyway.
Each changelog entry should include: what changed, why, commit hash(es).

## `@modelcontextprotocol/sdk` moves fast

Before trusting the build plan's code sketches (`extra.authInfo` shape, `mcpAuthMetadataRouter`,
`requireBearerAuth`, `checkResourceAllowed` export paths) literally, verify them against whatever
SDK version is actually installed — check `node_modules/@modelcontextprotocol/sdk/dist/esm/**/*.d.ts`.

## Never commit plaintext secrets

No plaintext passwords, connection strings, or API keys in git, even in this private repo.
Redact before committing — mirrors the same rule in PackTrack Pro.
