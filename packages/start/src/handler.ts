import { renderToWebStream, renderToString } from '@angora-js/server';
import { matchRoute } from './router-manifest.ts';
import { executeServerFunction } from './server-function.ts';
import type { StartHandlerOptions } from './types.ts';

/**
 * Creates a standard Web Fetch API request handler (compatible with Bun.serve, Cloudflare Workers, Node HTTP/2)
 *
 * @example
 * export default {
 *   fetch: createRequestHandler({ manifest, rootComponent: AppRoot })
 * };
 */
export function createRequestHandler(options: StartHandlerOptions) {
  return async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. Handle RPC Server Functions
    if (request.method === 'POST' && url.pathname === '/_angora/rpc') {
      try {
        const body = (await request.json()) as { id: string; args: any };
        const result = await executeServerFunction(body.id, body.args, request);
        return new Response(JSON.stringify({ result }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. Match Route for Page Request
    const matched = matchRoute(options.manifest, url.pathname);
    let loaderData: any = undefined;

    if (matched && matched.entry.module.loader) {
      try {
        loaderData = await matched.entry.module.loader({
          params: matched.params,
          request,
          url,
        });
      } catch (err: any) {
        console.error('[Angora Start Loader Error]:', err);
      }
    }

    // 3. Render via Streaming SSR
    try {
      const stream = renderToWebStream(options.rootComponent, {
        url: url.pathname,
        context: {
          url: url.pathname,
          params: matched?.params || {},
        },
        documentTemplate: options.documentTemplate,
      });

      return new Response(stream, {
        status: matched ? 200 : 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (err: any) {
      return new Response(`<h1>500 - Server Rendering Error</h1><pre>${err.message}</pre>`, {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  };
}
