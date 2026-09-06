import { describe, test, expect } from 'bun:test';
import '@angora-js/compiler';
import { Component, signal, computed, inject } from '@angora-js/core';
import {
  renderToString,
  hydrateApplication,
  TRANSFER_STATE,
  SERVER_CONTEXT,
} from '../src/index.ts';

describe('@angora-js/server - SSR & Hydration Engine', () => {
  test('should render component to HTML string with signals and control flow', async () => {
    @Component({
      selector: 'ssr-app',
      template: `
        <div class="container">
          <h1>{{ title() }}</h1>
          <p>Count: {{ count() }}</p>
        </div>
      `,
    })
    class SsrApp {
      title = signal('Angora SSR Engine');
      count = signal(42);
    }

    const { html } = await renderToString(SsrApp, { url: '/home' });

    expect(html).toContain('<div class="container">');
    expect(html).toContain('<h1>Angora SSR Engine</h1>');
    expect(html).toContain('<p>Count: 42</p>');
  });

  test('should support TransferState across server and client', async () => {
    @Component({
      selector: 'state-app',
      template: `<div>{{ user() }}</div>`,
    })
    class StateApp {
      user = signal('Guest');
      transferState = inject(TRANSFER_STATE);

      angoraOnInit() {
        this.transferState.set('user_profile', { id: 101, name: 'Alice' });
      }
    }

    const { html, stateScript, stateJson } = await renderToString(StateApp);

    expect(stateJson).toContain('"user_profile":{"id":101,"name":"Alice"}');
    expect(stateScript).toContain('id="__ANGORA_TRANSFER_STATE__"');
  });
});
