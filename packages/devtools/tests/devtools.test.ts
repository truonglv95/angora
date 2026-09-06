import { describe, test, expect, beforeEach } from 'bun:test';
import {
  getDevToolsBackend,
  configureDevTools,
  resetDevToolsBackend,
  type ComponentNode,
} from '../src/backend.ts';
import { enableProdMode, resetDevMode, signal } from '@angora-js/core';

describe('@angora-js/devtools - Chrome Extension DevTools Backend Engine', () => {
  beforeEach(() => {
    resetDevMode();
    resetDevToolsBackend();
  });

  test('should register and inspect component hierarchy in dev mode', () => {
    const backend = getDevToolsBackend();
    const node: ComponentNode = {
      id: 'comp_1',
      name: 'CounterComponent',
      selector: 'app-counter',
      scopeId: '_angora-app-counter',
      children: [],
      signals: { count: 10 },
      inputs: {},
      outputs: ['countChange'],
    };

    backend.registerComponent(node);
    expect(backend.components.size).toBe(1);
    expect(backend.getHierarchy()[0].name).toBe('CounterComponent');
    expect(backend.events.some(e => e.type === 'component:mount')).toBe(true);
  });

  test('should track signal registrations and live value updates with history in dev mode', () => {
    const backend = getDevToolsBackend();
    backend.registerSignal('sig_1', 'userCount', 0, false);
    expect(backend.signals.size).toBe(1);

    backend.updateSignal('sig_1', 1);
    backend.updateSignal('sig_1', 2);

    const sig = backend.signals.get('sig_1');
    expect(sig?.value).toBe(2);
    expect(sig?.history.length).toBe(3); // initial + 2 updates
    expect(backend.events.some(e => e.type === 'signal:update')).toBe(true);
  });

  test('should allow devtools state mutation in dev mode', () => {
    const backend = getDevToolsBackend();
    const countSig = signal(0);
    backend.registerSignal('sig_count', 'count', 0, false);

    const success = backend.updateSignalFromDevTools('sig_count', 99, countSig);
    expect(success).toBe(true);
    expect(countSig()).toBe(99);
    expect(backend.signals.get('sig_count')?.value).toBe(99);
  });

  test('should disable devtools backend completely in default production mode', () => {
    enableProdMode();
    const backend = getDevToolsBackend();
    expect(backend.mode).toBe('disabled');

    // Register calls should be complete no-ops
    backend.registerComponent({
      id: 'comp_prod',
      name: 'ProdComponent',
      selector: 'app-prod',
      children: [],
      signals: {},
      inputs: {},
      outputs: [],
    });
    expect(backend.components.size).toBe(0);
    expect(backend.events.length).toBe(0);

    backend.registerSignal('sig_p', 'p', 123);
    expect(backend.signals.size).toBe(0);
  });

  test('should support opt-in production profiling mode without memory leaks or state mutation', () => {
    enableProdMode();
    const backend = configureDevTools({ mode: 'profiling' });
    expect(backend.mode).toBe('profiling');
    expect(backend.allowMutation).toBe(false);
    expect(backend.maxHistory).toBe(0);

    // Register signal in profiling mode
    backend.registerSignal('sig_prof', 'activeUsers', 100);
    backend.updateSignal('sig_prof', 105);

    const sigSnapshot = backend.signals.get('sig_prof');
    expect(sigSnapshot?.value).toBe(105);
    // Crucial: history array is empty to prevent GC memory leaks in long-running prod sessions!
    expect(sigSnapshot?.history.length).toBe(0);

    // Tampering/mutation from DevTools must be rejected in profiling mode
    const countSig = signal(100);
    const success = backend.updateSignalFromDevTools('sig_prof', 99999, countSig);
    expect(success).toBe(false);
    expect(countSig()).toBe(100); // Unchanged!

    // Performance timing should be recorded
    backend.recordTiming('render:KrausestTable', 3.8);
    expect(backend.timings.length).toBe(1);
    expect(backend.timings[0].durationMs).toBe(3.8);
  });

  test('should record route navigation events', () => {
    const backend = getDevToolsBackend();
    backend.setRoute('/admin');
    expect(backend.activeRoute).toBe('/admin');
    expect(backend.events.some(e => e.type === 'route:change')).toBe(true);
  });
});
