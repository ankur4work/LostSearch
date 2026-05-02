/**
 * Embeddings via @xenova/transformers (all-MiniLM-L6-v2, 384-dim).
 *
 * The ONNX runtime + model loading can consume 300–500 MB of RAM. To prevent
 * an OOM kill from taking down the entire BullMQ worker process, embedding
 * runs in a dedicated child process (embed-worker.mjs). If the child OOMs,
 * only that process dies; the worker catches the error and falls back to zero
 * vectors so the product sync still completes.
 */
import { fork } from 'node:child_process';
import { join } from 'node:path';

export const EMBEDDING_DIM = 384;

const WORKER_PATH = join(__dirname, 'embed-worker.mjs');
const TIMEOUT_MS = 5 * 60 * 1000;

function runEmbedWorker(texts: string[]): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER_PATH, [], {
      execArgv: ['--experimental-vm-modules'],
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Embed worker timed out'));
    }, TIMEOUT_MS);

    child.on('message', (msg: { vectors?: number[][]; error?: string }) => {
      clearTimeout(timer);
      child.disconnect();
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.vectors ?? []);
    });

    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0 && signal !== null) {
        reject(new Error(`Embed worker killed (signal=${signal})`));
      }
    });

    child.send({ texts });
  });
}

export async function embed(text: string): Promise<number[]> {
  const [vec] = await runEmbedWorker([text]);
  return vec ?? Array(EMBEDDING_DIM).fill(0) as number[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return runEmbedWorker(texts);
}

/** Converts a JS number[] into the pgvector literal string `'[a,b,c,...]'`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
