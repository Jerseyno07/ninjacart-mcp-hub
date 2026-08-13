import OpenAI from 'openai';

// Embedding provider wrapper. Using OpenAI's text-embedding-3-small (1536
// dims) as the simpler default per the build plan — swap this file (and the
// `vector(N)` dimension in store.js's schema) if moving to another provider.
const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

// Constructed lazily, not at import time — the server must be able to boot
// (and serve query_packtrack_db) even before EMBEDDING_API_KEY is set.
let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.EMBEDDING_API_KEY });
  return client;
}

export async function embedText(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}

export async function embedTexts(texts) {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
