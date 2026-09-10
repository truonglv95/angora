import { Window } from 'happy-dom';
import { bootstrapApplication, type BootstrapOptions, getInjectedStyles } from '@angora-js/runtime';
import { Injector, rootInjector, getComponentDef } from '@angora-js/core';
import { Readable } from 'node:stream';
import {
  provideServerContext,
  TRANSFER_STATE,
  TransferState,
  type ServerContext,
} from './context.ts';

export interface RenderToWebStreamOptions extends BootstrapOptions {
  url?: string;
  context?: ServerContext;
  documentTemplate?: (content: { shell: string; styles: string; state: string }) => string;
  enableEventReplay?: boolean;
}

export const EVENT_REPLAY_SCRIPT = `<script id="__ANGORA_EVENT_REPLAY__">window.__ANGORA_EVENTS__=[];['click','input','change','keydown'].forEach(function(t){window.addEventListener(t,function(e){window.__ANGORA_EVENTS__.push({type:t,target:e.target,event:e,time:Date.now()})},{capture:true,passive:true})});</script>`;

/**
 * Renders an Angora application to a standard Web ReadableStream<Uint8Array>.
 * Compatible with modern Edge & Server runtimes: Cloudflare Workers, Bun, Deno, Node HTTP/2.
 * Automatically uses Pure String SSR when ssrRender is compiled, bypassing Happy-DOM completely.
 *
 * @example
 * const stream = renderToWebStream(AppComponent, { url: '/dashboard' });
 * return new Response(stream, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
 */
export function renderToWebStream<T>(
  componentType: new (...args: any[]) => T,
  options: RenderToWebStreamOptions = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const def = getComponentDef<T>(componentType);
  const compType = componentType as any;
  const ssrRender =
    (def as any)?.ssrRender ||
    compType?.ɵcmp?.ssrRender ||
    compType?.ssrRender ||
    (componentType.prototype as any)?.ssrRender;

  if (typeof ssrRender === 'function') {
    // Pure String SSR: ZERO Happy-DOM, ZERO virtual DOM allocations, blazing fast streaming
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const transferState = new TransferState();
          const serverProviders = [
            componentType,
            { provide: TRANSFER_STATE, useValue: transferState },
            ...(options.context
              ? provideServerContext(options.context)
              : options.url
                ? provideServerContext({ url: options.url })
                : []),
            ...(def?.metadata?.providers || []),
            ...(options.providers || []),
          ];
          const serverInjector = new Injector(serverProviders, rootInjector);
          const instance = serverInjector.get(componentType);

          // Allow microtasks to complete initial synchronous computations
          await new Promise(resolve => setTimeout(resolve, 0));

          const shellHtml = ssrRender(instance, serverInjector);
          const stateJson = transferState.toJson();
          const stateScript =
            stateJson !== '{}'
              ? `<script id="__ANGORA_TRANSFER_STATE__" type="application/json">${stateJson}</script>`
              : '';

          // Scoped styles
          const styles: string[] = [];
          const scopeId =
            def?.scopeId ||
            compType?.ɵcmp?.scopeId ||
            compType?.__angora_scope_id__ ||
            (def?.metadata?.selector
              ? `_angora-${def.metadata.selector.replace(/[^a-zA-Z0-9]/g, '-')}`
              : null);

          const rawStyles =
            def?.styles ||
            compType?.ɵcmp?.styles ||
            compType?.__angora_styles__ ||
            def?.metadata?.styles;

          if (scopeId && rawStyles) {
            const stylesList = Array.isArray(rawStyles) ? rawStyles : [rawStyles];
            for (const s of stylesList) {
              if (s) {
                styles.push(
                  `<style id="angora-style-${scopeId}" data-angora-scope="${scopeId}">${s}</style>`
                );
              }
            }
          }
          const stylesHtml = styles.join('\n');
          const replayScript = options.enableEventReplay !== false ? EVENT_REPLAY_SCRIPT : '';

          let outputHtml: string;
          if (options.documentTemplate) {
            outputHtml = options.documentTemplate({
              shell: shellHtml,
              styles: stylesHtml,
              state: stateScript,
            });
          } else {
            outputHtml = `${replayScript}${stylesHtml}\n<div id="app">${shellHtml}</div>\n${stateScript}`;
          }

          controller.enqueue(encoder.encode(outputHtml));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }

  // Fallback: Happy-DOM virtual environment
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const window = new Window();
      const previousDocument = (global as any).document;
      const previousWindow = (global as any).window;

      (global as any).document = window.document;
      (global as any).window = window;

      try {
        const container = window.document.createElement('div');
        container.id = 'app';
        window.document.body.appendChild(container);

        const transferState = new TransferState();
        const serverProviders = [
          { provide: TRANSFER_STATE, useValue: transferState },
          ...(options.context
            ? provideServerContext(options.context)
            : options.url
              ? provideServerContext({ url: options.url })
              : []),
          ...(options.providers || []),
        ];

        bootstrapApplication(componentType, container as any, {
          providers: serverProviders,
        });

        // Allow microtasks to complete initial synchronous computations
        await new Promise(resolve => setTimeout(resolve, 0));

        const shellHtml = container.innerHTML;
        const injectedStyles = getInjectedStyles();
        const stylesHtml = injectedStyles
          .map(
            s =>
              `<style id="angora-style-${s.scopeId}" data-angora-scope="${s.scopeId}">${s.css}</style>`
          )
          .join('\n');

        const stateJson = transferState.toJson();
        const stateScript =
          stateJson !== '{}'
            ? `<script id="__ANGORA_TRANSFER_STATE__" type="application/json">${stateJson}</script>`
            : '';

        const replayScript = options.enableEventReplay !== false ? EVENT_REPLAY_SCRIPT : '';

        let outputHtml: string;
        if (options.documentTemplate) {
          outputHtml = options.documentTemplate({
            shell: shellHtml,
            styles: stylesHtml,
            state: stateScript,
          });
        } else {
          outputHtml = `${replayScript}${stylesHtml}\n<div id="app">${shellHtml}</div>\n${stateScript}`;
        }

        // Enqueue shell chunk to stream
        controller.enqueue(encoder.encode(outputHtml));

        // Close stream cleanly
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        (global as any).document = previousDocument;
        (global as any).window = previousWindow;
      }
    },
  });
}

/**
 * Renders an Angora application to a Node.js Readable stream.
 * Compatible with Node.js HTTP servers (Express, Fastify, Koa, Connect, http.createServer).
 *
 * @example
 * const stream = renderToNodeStream(AppComponent, { url: '/dashboard' });
 * stream.pipe(res);
 */
export function renderToNodeStream<T>(
  componentType: new (...args: any[]) => T,
  options: RenderToWebStreamOptions = {}
): Readable {
  const webStream = renderToWebStream(componentType, options);
  if (typeof (Readable as any).fromWeb === 'function') {
    return (Readable as any).fromWeb(webStream);
  }
  const reader = webStream.getReader();
  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      } catch (err) {
        this.destroy(err as Error);
      }
    },
  });
}
