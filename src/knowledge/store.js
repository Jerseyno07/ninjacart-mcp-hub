import pg from 'pg';
import { EMBEDDING_DIMENSIONS } from './embed.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.KNOWLEDGE_DATABASE_URL, max: 5 });

// Creates the pgvector extension + knowledge_chunks table if they don't
// exist yet. Called once by ingest.js — not on every request.
export async function ensureSchema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id BIGSERIAL PRIMARY KEY,
      project VARCHAR(60) NOT NULL,
      source_file VARCHAR(255) NOT NULL,
      heading VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      embedding VECTOR(${EMBEDDING_DIMENSIONS}) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (project, source_file, heading)
    );
  `);
}

// Replaces all chunks for a project's source_file with the freshly-embedded
// set — simplest way to keep re-ingestion idempotent without diffing.
export async function replaceFileChunks(project, sourceFile, chunks) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM knowledge_chunks WHERE project = $1 AND source_file = $2',
      [project, sourceFile],
    );
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO knowledge_chunks (project, source_file, heading, content, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        [project, sourceFile, chunk.heading, chunk.content, JSON.stringify(chunk.embedding)],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function search(queryEmbedding, project, topK = 6) {
  const { rows } = await pool.query(
    `SELECT source_file, heading, content, 1 - (embedding <=> $1) AS score
     FROM knowledge_chunks
     WHERE project = $2
     ORDER BY embedding <=> $1
     LIMIT $3`,
    [JSON.stringify(queryEmbedding), project, topK],
  );
  return rows;
}
