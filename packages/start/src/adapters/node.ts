import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createRequestHandler } from '../handler.ts';
import type { StartHandlerOptions } from '../types.ts';

/**
 * Node.js HTTP & Bun Standalone Server adapter for @angora-js/start
 * Converts Node IncomingMessage to standard Web Request, streams response back.
 *
 * @example
 * import http from 'node:http';
 * import { createNodeHandler } from '@angora-js/start/adapters/node';
 *
 * const handler = createNodeHandler({ manifest, rootComponent: AppRoot });
 * http.createServer(handler).listen(3000);
 */
export function createNodeHandler(options: StartHandlerOptions) {
  const handler = createRequestHandler(options);

  return async function nodeListener(req: IncomingMessage, res: ServerResponse) {
    try {
      const protocol = (req.socket as any)?.encrypted ? 'https' : 'http';
      const host = req.headers.host || 'localhost';
      const fullUrl = `${protocol}://${host}${req.url}`;

      // Build Web Request body if method has payload
      let body: any = null;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        body = Readable.toWeb(req) as any;
      }

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else {
            headers.set(key, value);
          }
        }
      }

      const webRequest = new Request(fullUrl, {
        method: req.method,
        headers,
        body,
        // @ts-ignore
        duplex: body ? 'half' : undefined,
      });

      const webResponse = await handler(webRequest);

      res.statusCode = webResponse.status;
      webResponse.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      if (!webResponse.body) {
        res.end();
        return;
      }

      // Stream Web ReadableStream to Node ServerResponse
      const nodeStream = Readable.fromWeb(webResponse.body as any);
      nodeStream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end(err?.message || 'Internal Server Error');
      }
    }
  };
}
