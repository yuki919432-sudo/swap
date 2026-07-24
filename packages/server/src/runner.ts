/**
 * A thin boundary over Supabase RPC calls. Isolating this makes the flow modules
 * fully unit-testable (inject a fake runner) while the real database behaviour is
 * covered by the pgTAP suite. All RPC errors are mapped to typed AppErrors here.
 */
import type { Json } from "./db-types.js";
import type { DbClient } from "./supabase.js";
import { mapPostgresError } from "./sqlstate.js";

export interface RpcRunner {
  rpc<T = Json>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

export function createRpcRunner(client: DbClient): RpcRunner {
  return {
    async rpc<T = Json>(fn: string, args?: Record<string, unknown>): Promise<T> {
      // Dynamic fn name intentionally bypasses the per-function generic typing.
      const rpc = client.rpc as unknown as (
        n: string,
        a?: unknown,
      ) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc(fn, args);
      if (error) throw mapPostgresError(error);
      return data as T;
    },
  };
}
