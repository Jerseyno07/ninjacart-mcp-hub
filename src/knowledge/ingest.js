#!/usr/bin/env node
// Re-run manually whenever a project's notes/ folder changes:
//   node src/knowledge/ingest.js --project packtrack
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitMarkdown } from './chunk.js';
import { embedTexts } from './embed.js';
import { ensureSchema, replaceFileChunks } from './store.js';
import { log } from '../util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseProjectArg() {
  const idx = process.argv.indexOf('--project');
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error('Usage: node src/knowledge/ingest.js --project <name>');
  }
  return process.argv[idx + 1];
}

async function main() {
  const project = parseProjectArg();
  const notesDir = path.join(__dirname, '..', 'projects', project, 'notes');

  const files = (await readdir(notesDir)).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    console.log(`No .md files found in ${notesDir} — nothing to ingest.`);
    return;
  }

  await ensureSchema();

  for (const file of files) {
    const text = await readFile(path.join(notesDir, file), 'utf-8');
    const chunks = splitMarkdown(text, file);
    if (chunks.length === 0) continue;

    const embeddings = await embedTexts(chunks.map((c) => c.content), 'document');
    const chunksWithEmbeddings = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

    await replaceFileChunks(project, file, chunksWithEmbeddings);
    log('knowledge_ingest_file', { project, file, chunks: chunks.length });
    console.log(`Ingested ${chunks.length} chunk(s) from ${file}`);
  }

  console.log(`Done — ${files.length} file(s) ingested for project "${project}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
