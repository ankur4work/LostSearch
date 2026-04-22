// Local embeddings via @xenova/transformers (all-MiniLM-L6-v2, 384-dim).
// NOTE: the library lazy-loads WASM and model files on first use; keep the
// pipeline cached at module scope so warm paths are cheap.

type FeatureExtractionPipeline = (
  texts: string | string[],
  options?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const transformers = await import('@xenova/transformers');
      const pipe = await transformers.pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
      );
      return pipe as unknown as FeatureExtractionPipeline;
    })();
  }
  return pipelinePromise;
}

export const EMBEDDING_DIM = 384;

export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const out = await pipe(text, { pooling: 'mean', normalize: true });
  if (out.data.length !== EMBEDDING_DIM) {
    throw new Error(
      `Expected ${EMBEDDING_DIM}-dim vector, got ${out.data.length}`,
    );
  }
  return Array.from(out.data);
}

/** Converts a JS number[] into the pgvector literal string `'[a,b,c,...]'`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
