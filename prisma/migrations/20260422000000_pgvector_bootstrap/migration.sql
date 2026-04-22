-- Bootstrap migration: enable pgvector *before* any Prisma migration runs.
-- This file must be the lowest-numbered migration so subsequent migrations that
-- reference Unsupported("vector(384)") can resolve the type.

CREATE EXTENSION IF NOT EXISTS vector;
