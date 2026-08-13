import { z } from 'zod';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { rejectIfUnsafe, wrapWithLimit, applyRowCap, MAX_ROWS } from './queryGuard.js';
import { embedText } from '../../knowledge/embed.js';
import { search as searchKnowledge } from '../../knowledge/store.js';
import { log } from '../../util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaContext = readFileSync(path.join(__dirname, 'schema-context.md'), 'utf-8');

const PROJECT_NAME = 'packtrack';

function projectGateError() {
  return {
    content: [{ type: 'text', text: `Not authorized: your account isn't granted access to the "${PROJECT_NAME}" project on this MCP server. Ask an admin to add it to your roles.js entry.` }],
    isError: true,
  };
}

export function register(mcpServer) {
  mcpServer.registerTool(
    'query_packtrack_db',
    {
      title: 'Query PackTrack Pro database',
      description: `Run a read-only SQL SELECT query against the PackTrack Pro database (packaging material tracking: PM Store → FC/CC warehouse logistics). Strictly read-only — write/DDL keywords are rejected. Results capped at ${MAX_ROWS} rows.\n\n${schemaContext}`,
      inputSchema: {
        sql: z.string().min(1).describe('A single read-only SQL SELECT statement.'),
      },
    },
    async ({ sql }, extra) => {
      const email = extra.authInfo?.extra?.email;
      const projects = extra.authInfo?.extra?.projects ?? [];
      if (!projects.includes(PROJECT_NAME)) return projectGateError();

      const rejection = rejectIfUnsafe(sql);
      if (rejection) {
        log('packtrack_query', { email, sql, rejected: true, reason: rejection });
        return { content: [{ type: 'text', text: rejection }], isError: true };
      }

      const startedAt = Date.now();
      try {
        const result = await pool.query(wrapWithLimit(sql));
        const { rows, truncated } = applyRowCap(result.rows);
        const durationMs = Date.now() - startedAt;
        log('packtrack_query', { email, sql, rowCount: rows.length, durationMs });

        const text = truncated
          ? `${JSON.stringify(rows, null, 2)}\n\nResult truncated to ${MAX_ROWS} rows — narrow your query.`
          : JSON.stringify(rows, null, 2);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        log('packtrack_query', { email, sql, error: err.message, durationMs });
        return { content: [{ type: 'text', text: `Query failed: ${err.message}` }], isError: true };
      }
    },
  );

  mcpServer.registerTool(
    'search_packtrack_knowledge',
    {
      title: 'Search PackTrack Pro knowledge base',
      description: 'Search PackTrack Pro\'s conceptual/how-it-works notes (PO/indent upload validations, GRN flow, role model, force-complete semantics). Use this for "how does X work" or "what are the rules for Y" questions — NOT for live data, which query_packtrack_db handles.',
      inputSchema: {
        query: z.string().min(1).describe('A natural-language question about how PackTrack Pro works.'),
      },
    },
    async ({ query }, extra) => {
      const email = extra.authInfo?.extra?.email;
      const projects = extra.authInfo?.extra?.projects ?? [];
      if (!projects.includes(PROJECT_NAME)) return projectGateError();

      const embedding = await embedText(query);
      const results = await searchKnowledge(embedding, PROJECT_NAME, 6);
      log('packtrack_knowledge_search', { email, query, topScore: results[0]?.score ?? null });

      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No relevant notes found for this question. Answer only from what is returned here — do not fall back to general knowledge about PackTrack Pro.' }] };
      }

      const text = results
        .map((r) => `### ${r.heading} (${r.source_file}, score ${r.score.toFixed(3)})\n${r.content}`)
        .join('\n\n---\n\n');
      return { content: [{ type: 'text', text }] };
    },
  );
}
