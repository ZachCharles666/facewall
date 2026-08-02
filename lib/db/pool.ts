import "server-only";

import { Pool } from "pg";

import { readDatabaseConfig } from "@/lib/config/internalBeta";

declare global {
  var __passbuddyRuntimePool: Pool | undefined;
  var __passbuddyAdminPool: Pool | undefined;
}

function createPool(
  connectionString: string,
  applicationName: string,
  options?: string
) {
  return new Pool({
    connectionString,
    application_name: applicationName,
    options,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}

export function getRuntimePool() {
  const config = readDatabaseConfig();
  globalThis.__passbuddyRuntimePool ??= createPool(
    config.runtimeUrl,
    "passbuddy-runtime",
    "-c search_path=auth,public"
  );
  return globalThis.__passbuddyRuntimePool;
}

export function getAdminPool() {
  const config = readDatabaseConfig();
  globalThis.__passbuddyAdminPool ??= createPool(config.adminUrl, "passbuddy-admin");
  return globalThis.__passbuddyAdminPool;
}
