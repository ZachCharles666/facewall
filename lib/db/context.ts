import "server-only";

import type { Pool, PoolClient } from "pg";

import { getAdminPool, getRuntimePool } from "@/lib/db/pool";

export async function withUserTransaction<T>(
  userId: string,
  operation: (client: PoolClient) => Promise<T>,
  pool: Pool = getRuntimePool()
) {
  if (!userId.trim()) throw new Error("AUTH_REQUIRED");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function withAdminTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
  pool: Pool = getAdminPool()
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.is_admin', 'true', true)");
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
