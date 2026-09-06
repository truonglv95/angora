import { createRequestHandler } from '../handler.ts';
import type { StartHandlerOptions } from '../types.ts';

export interface CloudflareEnv {
  [key: string]: any;
}

export interface CloudflareExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

/**
 * Cloudflare Workers & Pages adapter for @angora-js/start
 * Fully supports streaming Web Streams API on V8 isolates.
 *
 * @example
 * import { createCloudflareHandler } from '@angora-js/start/adapters/cloudflare';
 * export default {
 *   fetch: createCloudflareHandler({ manifest, rootComponent: AppRoot })
 * };
 */
export function createCloudflareHandler(options: StartHandlerOptions) {
  const handler = createRequestHandler(options);

  return async function handleCloudflareRequest(
    request: Request,
    env?: CloudflareEnv,
    ctx?: CloudflareExecutionContext
  ): Promise<Response> {
    // Attach env and execution context to request context if needed
    (request as any).env = env;
    (request as any).ctx = ctx;
    return handler(request);
  };
}
