import { Window } from 'happy-dom';
import { bootstrapApplication, type BootstrapOptions, getInjectedStyles } from '@angora-js/runtime';
import { Injector, rootInjector } from '@angora-js/core';
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
 * Uses Happy-DOM environment in Bun / Node for blazing fast execution.
 *
 * @example
 * const { html, stateScript } = await renderToString(AppComponent, { url: '/todos' });
 */
export async function renderToString<T>(
  componentType: new (...args: any[]) => T,
  options: RenderToStringOptions = {}
): Promise<RenderResult> {
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
