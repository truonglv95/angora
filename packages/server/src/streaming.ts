import { Window } from 'happy-dom';
import { bootstrapApplication, type BootstrapOptions, getInjectedStyles } from '@angora-js/runtime';
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
