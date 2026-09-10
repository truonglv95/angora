import { describe, test, expect, beforeEach } from 'bun:test';
import '@angora-js/compiler';
import { Component, signal, inject } from '@angora-js/core';
import { Window } from 'happy-dom';
import {
  renderToWebStream,
  replayQueuedEvents,
  hydrateApplication,
  TRANSFER_STATE,
  EVENT_REPLAY_SCRIPT,
} from '../src/index.ts';

describe('@angora-js/server - Streaming SSR & Event Replay Engine', () => {
  test('should stream component HTML chunks via ReadableStream', async () => {
    @Component({
      selector: 'stream-app',
      template: `
        <div class="hero">
          <h1>{{ heading() }}</h1>
        </div>
      `,
    })
    class StreamApp {
      heading = signal('Streaming Angora App');
    }

    const stream = renderToWebStream(StreamApp, { url: '/stream' });
    expect(stream).toBeInstanceOf(ReadableStream);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    expect(result).toContain(EVENT_REPLAY_SCRIPT);
    expect(result).toContain(
      '<div id="app"><div class="hero"><h1>Streaming Angora App</h1></div></div>'
    );
  });

  test('should support custom documentTemplate in renderToWebStream', async () => {
    @Component({
      selector: 'templated-app',
      template: `<p>Hello Edge</p>`,
    })
    class TemplatedApp {}

    const stream = renderToWebStream(TemplatedApp, {
      documentTemplate: ({ shell, styles, state }) => {
        return `<!DOCTYPE html><html><head>${styles}</head><body><main id="app">${shell}</main>${state}</body></html>`;
      },
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value);
    }

    expect(html).toContain('<!DOCTYPE html><html><head>');
    expect(html).toContain('<main id="app"><p>Hello Edge</p></main>');
  });

  test('should replay queued events captured by replay buffer upon hydration', () => {
    const window = new Window();
    (globalThis as any).window = window;
    (globalThis as any).document = window.document;

    const container = window.document.createElement('div');
    container.id = 'app';
    window.document.body.appendChild(container);

    let clickCount = 0;
    const button = window.document.createElement('button');
    button.id = 'test-btn';
    button.addEventListener('click', () => {
      clickCount++;
    });
    container.appendChild(button);

    // Simulate event captured before hydration completed
    (window as any).__ANGORA_EVENTS__ = [
      { type: 'click', target: button, event: {} },
      { type: 'click', target: button, event: {} },
    ];

    expect(clickCount).toBe(0);

    const replayed = replayQueuedEvents();

    expect(replayed).toBe(2);
    expect(clickCount).toBe(2);
    expect((window as any).__ANGORA_EVENTS__.length).toBe(0);
  });

  test('should use pure string SSR in renderToWebStream when ssrRender is present', async () => {
    class FastApp {
      static ɵcmp = {
        scopeId: 'ag-fast',
        styles: ['.fast { color: red; }'],
        ssrRender: (ctx: any) => `<div class="fast">Pure String Stream</div>`,
      };
    }

    const stream = renderToWebStream(FastApp);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value);
    }

    expect(html).toContain('Pure String Stream');
    expect(html).toContain(
      '<style id="angora-style-ag-fast" data-angora-scope="ag-fast">.fast { color: red; }</style>'
    );
    expect(html).toContain(EVENT_REPLAY_SCRIPT);
  });

  test('should render to Node.js Readable stream with renderToNodeStream', async () => {
    const { renderToNodeStream } = await import('../src/index.ts');

    class NodeApp {
      static ɵcmp = {
        ssrRender: () => `<h1>Node Streamed</h1>`,
      };
    }

    const nodeStream = renderToNodeStream(NodeApp);
    let result = '';

    await new Promise<void>((resolve, reject) => {
      nodeStream.on('data', (chunk: any) => {
        result += chunk.toString();
      });
      nodeStream.on('end', () => resolve());
      nodeStream.on('error', reject);
    });

    expect(result).toContain('<h1>Node Streamed</h1>');
  });
});
