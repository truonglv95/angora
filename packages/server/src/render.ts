import { Window } from 'happy-dom';
import { bootstrapApplication, type BootstrapOptions, getInjectedStyles } from '@angora-js/runtime';
import { Injector, rootInjector, getComponentDef } from '@angora-js/core';
import {
  provideServerContext,
  TRANSFER_STATE,
  TransferState,
  type ServerContext,
} from './context.ts';

export interface RenderToStringOptions extends BootstrapOptions {
  url?: string;
  context?: ServerContext;
  documentTitle?: string;
}

export interface RenderResult {
  html: string;
  stateJson: string;
  stateScript: string;
  stylesHtml: string;
}

/**
 * Renders an Angora standalone root component to an HTML string on the server.
 * Uses Pure String SSR when ssrRender is compiled, and falls back to Happy-DOM.
 *
 * @example
 * const { html, stateScript } = await renderToString(AppComponent, { url: '/todos' });
 */
export async function renderToString<T>(
  componentType: new (...args: any[]) => T,
  options: RenderToStringOptions = {}
): Promise<RenderResult> {
  const def = getComponentDef<T>(componentType);
  const compType = componentType as any;
  const ssrRender =
    (def as any)?.ssrRender ||
    compType?.ɵcmp?.ssrRender ||
    compType?.ssrRender ||
    (componentType.prototype as any)?.ssrRender;

  if (typeof ssrRender === 'function') {
    // Pure String SSR: ZERO Happy-DOM, ZERO virtual DOM allocations, blazing fast!
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

    // Initial microtask tick for signals/computeds if needed
    await new Promise(resolve => setTimeout(resolve, 0));

    const html = ssrRender(instance, serverInjector);
    const stateJson = transferState.toJson();
    const stateScript =
      stateJson !== '{}'
        ? `<script id="__ANGORA_TRANSFER_STATE__" type="application/json">${stateJson}</script>`
        : '';

    // Collect scoped styles
    const styles: string[] = [];
    const scopeId =
      def?.scopeId ||
      compType?.ɵcmp?.scopeId ||
      compType?.__angora_scope_id__ ||
      (def?.metadata?.selector
        ? `_angora-${def.metadata.selector.replace(/[^a-zA-Z0-9]/g, '-')}`
        : null);

    const rawStyles =
      def?.styles || compType?.ɵcmp?.styles || compType?.__angora_styles__ || def?.metadata?.styles;

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

    return {
      html,
      stateJson,
      stateScript,
      stylesHtml: styles.join('\n'),
    };
  }

  // Setup isolated DOM environment for this request
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

    // Bootstrap application on server DOM
    const instance = bootstrapApplication(componentType, container as any, {
      providers: serverProviders,
    });

    // Allow microtasks to complete initial synchronous computations
    await new Promise(resolve => setTimeout(resolve, 0));

    const html = container.innerHTML;
    const stateJson = transferState.toJson();
    const stateScript =
      stateJson !== '{}'
        ? `<script id="__ANGORA_TRANSFER_STATE__" type="application/json">${stateJson}</script>`
        : '';

    const injectedStyles = getInjectedStyles();
    const stylesHtml = injectedStyles
      .map(
        s =>
          `<style id="angora-style-${s.scopeId}" data-angora-scope="${s.scopeId}">${s.css}</style>`
      )
      .join('\n');

    return {
      html,
      stateJson,
      stateScript,
      stylesHtml,
    };
  } finally {
    (global as any).document = previousDocument;
    (global as any).window = previousWindow;
  }
}
