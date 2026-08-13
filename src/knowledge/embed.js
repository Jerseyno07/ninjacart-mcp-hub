import { VoyageAIClient } from 'voyageai';

// Embedding provider wrapper. Voyage AI (Anthropic's recommended embeddings
// partner) — swap this file (and the `vector(N)` dimension in store.js's
// schema) if moving to another provider. `voyage-4`, Voyage's current
// general-purpose model, defaults to 1024 dims.
const EMBEDDING_MODEL = 'voyage-4';
export const EMBEDDING_DIMENSIONS = 1024;

// Constructed lazily, not at import time — the server must be able to boot
// (and serve query_packtrack_db) even before EMBEDDING_API_KEY is set.
let client;
function getClient() {
  if (!client) client = new VoyageAIClient({ apiKey: process.env.EMBEDDING_API_KEY });
  return client;
}

// inputType: 'document' when embedding notes at ingest time, 'query' when
// embedding the incoming search question — Voyage uses this to optimize the
// embedding for each side of a retrieval match.
export async function embedText(text, inputType) {
  const [vector] = await embedTexts([text], inputType);
  return vector;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Voyage's free tier (no payment method on file) caps requests at 3/minute —
// easy to hit when ingesting several notes files back to back. Retry with
// backoff on 429 rather than failing the whole ingestion run partway through.
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 21_000; // just over 20s, so 3 retries always clears a fresh 3-RPM window

export async function embedTexts(texts, inputType) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await getClient().embed({
        input: texts,
        model: EMBEDDING_MODEL,
        inputType,
      });
      return response.data.map((d) => d.embedding);
    } catch (err) {
      if (err.statusCode !== 429 || attempt >= MAX_RETRIES) throw err;
      console.log(`Voyage rate limit hit, retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}
