/**
 * Standalone embedding child process.
 * Parent sends: { texts: string[] }
 * Child replies: { vectors: number[][] } or { error: string }
 * Runs in its own process so an OOM kill doesn't take down the BullMQ worker.
 */
import { pipeline } from '@xenova/transformers';

const EMBEDDING_DIM = 384;

let pipe = null;

async function getPipeline() {
  if (!pipe) {
    pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipe;
}

process.on('message', async (msg) => {
  try {
    const { texts } = msg;
    if (!Array.isArray(texts) || texts.length === 0) {
      process.send({ vectors: [] });
      return;
    }
    const p = await getPipeline();
    const out = await p(texts, { pooling: 'mean', normalize: true });
    const n = texts.length;
    const vectors = texts.map((_, i) =>
      Array.from(out.data.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)),
    );
    process.send({ vectors });
  } catch (err) {
    process.send({ error: String(err) });
  }
});
