import { prisma } from '../prisma';
import { toVectorLiteral } from '../ingestion/embeddings';

export interface SemanticMatch {
  productId: string;
  shopifyProductId: string;
  title: string;
  similarity: number;
}

/**
 * Top-K semantic matches via pgvector. Uses cosine distance operator `<=>`,
 * converted to similarity = 1 - distance. Only products that have an embedding
 * are considered.
 *
 * Raw SQL because Prisma's JS layer has no first-class pgvector type and
 * Unsupported columns cannot be used in `where` or `orderBy`.
 */
export async function topKSemanticMatches(
  storeId: string,
  queryEmbedding: number[],
  k = 20,
): Promise<SemanticMatch[]> {
  const vec = toVectorLiteral(queryEmbedding);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      shopify_product_id: string;
      title: string;
      similarity: number;
    }>
  >(
    `SELECT id, shopify_product_id, title,
            1 - (embedding <=> $1::vector) AS similarity
       FROM catalog_products
      WHERE store_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $3`,
    vec,
    storeId,
    k,
  );

  return rows.map((r) => ({
    productId: r.id,
    shopifyProductId: r.shopify_product_id,
    title: r.title,
    similarity: Number(r.similarity),
  }));
}
