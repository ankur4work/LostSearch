import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ShopifyClient } from './client';
import { logger } from '../logger';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 30 * 60_000;

type BulkStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'CANCELED' | 'EXPIRED' | 'FAILED';

interface BulkOperation {
  id: string;
  status: BulkStatus;
  url: string | null;
  objectCount?: string;
  errorCode?: string | null;
}

const RUN_MUTATION = /* GraphQL */ `
  mutation BulkRunQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

const CURRENT_QUERY = /* GraphQL */ `
  query CurrentBulkOp {
    currentBulkOperation(type: QUERY) {
      id status url objectCount errorCode
    }
  }
`;

const CANCEL_MUTATION = /* GraphQL */ `
  mutation BulkCancel($id: ID!) {
    bulkOperationCancel(id: $id) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

export class BulkOperationError extends Error {
  constructor(
    message: string,
    public readonly status: BulkStatus,
    public readonly errorCode?: string | null,
  ) {
    super(message);
    this.name = 'BulkOperationError';
  }
}

export async function runBulkQuery<T>(
  client: ShopifyClient,
  query: string,
  onRecord: (record: T) => Promise<void> | void,
): Promise<{ objectCount: number }> {
  const start = await client.graphql<{
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: BulkStatus } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(RUN_MUTATION, { query });

  const userErrors = start.data?.bulkOperationRunQuery.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new BulkOperationError(
      `bulkOperationRunQuery userErrors: ${userErrors.map((e) => e.message).join('; ')}`,
      'FAILED',
    );
  }
  const op = start.data?.bulkOperationRunQuery.bulkOperation;
  if (!op) {
    throw new BulkOperationError('bulkOperationRunQuery returned no operation', 'FAILED');
  }
  logger.info({ shop: client.shopDomain, bulkId: op.id }, 'Bulk operation started');

  const finished = await pollUntilTerminal(client);
  if (finished.status === 'CANCELED' || finished.status === 'EXPIRED' || finished.status === 'FAILED') {
    throw new BulkOperationError(
      `Bulk op ${finished.status}${finished.errorCode ? ` (${finished.errorCode})` : ''}`,
      finished.status,
      finished.errorCode,
    );
  }
  if (finished.status !== 'COMPLETED' || !finished.url) {
    throw new BulkOperationError(`Unexpected bulk op state: ${finished.status}`, finished.status);
  }

  const objectCount = Number(finished.objectCount ?? '0');
  await streamJsonl<T>(finished.url, onRecord);
  return { objectCount };
}

async function pollUntilTerminal(client: ShopifyClient): Promise<BulkOperation> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const resp = await client.graphql<{ currentBulkOperation: BulkOperation | null }>(CURRENT_QUERY);
    const op = resp.data?.currentBulkOperation;
    if (!op) continue;
    if (op.status === 'CREATED' || op.status === 'RUNNING') continue;
    return op;
  }
  // Try to cancel before giving up.
  const resp = await client.graphql<{ currentBulkOperation: BulkOperation | null }>(CURRENT_QUERY);
  const op = resp.data?.currentBulkOperation;
  if (op && (op.status === 'CREATED' || op.status === 'RUNNING')) {
    await client.graphql(CANCEL_MUTATION, { id: op.id });
  }
  throw new BulkOperationError('Bulk op poll timed out', 'FAILED');
}

async function streamJsonl<T>(url: string, onRecord: (r: T) => Promise<void> | void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new BulkOperationError(`Failed to download bulk JSONL (${res.status})`, 'FAILED');
  }
  const nodeStream = Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream);
  const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    const parsed = JSON.parse(line) as T;
    await onRecord(parsed);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
