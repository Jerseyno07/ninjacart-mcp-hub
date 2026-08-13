import OpenAI from 'openai';

// Embedding provider wrapper. Using OpenAI's text-embedding-3-small (1536
// dims) as the simpler default per the build plan — swap this file (and the
// `vector(N)` dimension in store.js's schema) if moving to another provider.
const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

const client = new OpenAI({ apiKey: process.env.EMBEDDING_API_KEY });

export async function embedText(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}

export async function embedTexts(texts) {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}
