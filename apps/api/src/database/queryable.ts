import type { Pool, PoolClient } from 'pg';

/** Either the pool (autocommit) or a checked-out client mid-transaction. */
export type Queryable = Pick<Pool | PoolClient, 'query'>;
