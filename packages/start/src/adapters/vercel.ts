import { createRequestHandler } from '../handler.ts';
import type { StartHandlerOptions } from '../types.ts';

/**
 * Vercel Edge Middleware & Serverless Function adapter for @angora-js/start
 *
 * @example
 * import { createVercelEdgeHandler } from '@angora-js/start/adapters/vercel';
 * export default createVercelEdgeHandler({ manifest, rootComponent: AppRoot });
 */
export function createVercelEdgeHandler(options: StartHandlerOptions) {
  const handler = createRequestHandler(options);

  return async function handleVercelRequest(request: Request): Promise<Response> {
    return handler(request);
  };
}
