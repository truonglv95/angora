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

  test('should handle component:update and hmr:update and increment renderCount', () => {
    const backend = getDevToolsBackend();
    backend.registerComponent({
      id: 'comp_1',
      name: 'Counter',
      selector: 'app-counter',
      children: [],
      signals: {},
      inputs: {},
      outputs: [],
    });

    const comp = backend.components.get('comp_1');
    expect(comp?.renderCount).toBe(1);

    backend.emit({
      type: 'hmr:update',
      timestamp: Date.now(),
      payload: {
        id: 'comp_1',
        name: 'Counter',
        durationMs: 0.8,
      },
    });

    expect(comp?.renderCount).toBe(2);
    expect(comp?.lastRenderDuration).toBe(0.8);
    expect(backend.events.some(e => e.type === 'hmr:update')).toBe(true);
  });

  test('should support time-travel debugging to revert signals to previous states', () => {
    const backend = getDevToolsBackend();
    const countSig = signal(10);
    backend.registerSignal('sig_count', 'count', 10, false, 'comp_1', countSig);

    // Perform several state mutations
    countSig.set(20);
    backend.updateSignal('sig_count', 20);

    countSig.set(30);
    backend.updateSignal('sig_count', 30);

    const snapshot = backend.signals.get('sig_count');
    expect(snapshot?.history.length).toBe(3); // 10, 20, 30
    expect(countSig()).toBe(30);

    // Time-travel back to step 0 (initial value = 10)
    const success = backend.timeTravelSignal('sig_count', 0);
    expect(success).toBe(true);
    expect(countSig()).toBe(10);
    expect(backend.signals.get('sig_count')?.value).toBe(10);

    // Time-travel forward to step 1 (value = 20)
    backend.timeTravelSignal('sig_count', 1);
    expect(countSig()).toBe(20);

    // Verify unified timeline extraction
    const timeline = backend.getTimeline();
    expect(timeline.length).toBe(3);
    expect(timeline[0].value).toBe(10);
    expect(timeline[1].value).toBe(20);
    expect(timeline[2].value).toBe(30);
  });
});
