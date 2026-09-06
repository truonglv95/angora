import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import {
  enableClickToSourceInspector,
  openInEditor,
  resetInspectorForTesting,
} from '../src/inspector.ts';

describe('@angora-js/runtime - Click-to-Source Inspector', () => {
  beforeEach(() => {
    resetInspectorForTesting();
    const window = new Window();
    (globalThis as any).document = window.document;
    (globalThis as any).window = window;
    (globalThis as any).KeyboardEvent = window.KeyboardEvent;
    (globalThis as any).MouseEvent = window.MouseEvent;
    document.body.innerHTML = '';
  });

  test('should find component target and render overlay when holding Alt', () => {
    const compEl = document.createElement('app-dashboard');
    compEl.setAttribute('data-angora-component', 'DashboardComponent');
    compEl.setAttribute('data-angora-source', '/src/views/dashboard.component.ts:164:12');
    compEl.innerHTML = '<button id="btn">Click me</button>';
    document.body.appendChild(compEl);

    enableClickToSourceInspector();

    const btn = document.getElementById('btn')!;

    // Simulate Alt key down
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, key: 'Alt' }));

    // Simulate MouseMove over button inside component
    btn.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        altKey: true,
      })
    );

    const overlay = document.getElementById('__angora_inspector_overlay__');
    expect(overlay).not.toBeNull();
    expect(overlay?.style.display).toBe('block');

    const badge = document.getElementById('__angora_inspector_badge__');
    expect(badge?.textContent).toContain('DashboardComponent');
    expect(badge?.textContent).toContain('dashboard.component.ts');
  });

  test('should hide overlay when Alt is released', () => {
    const compEl = document.createElement('app-todo');
    compEl.setAttribute('data-angora-component', 'TodoComponent');
    compEl.setAttribute('data-angora-source', '/src/todo.component.ts:10:5');
    document.body.appendChild(compEl);

    enableClickToSourceInspector();

    // Key down & mouse move
    window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, key: 'Alt' }));
    compEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, altKey: true }));

    const overlay = document.getElementById('__angora_inspector_overlay__');
    expect(overlay?.style.display).toBe('block');

    // Release Alt
    window.dispatchEvent(new KeyboardEvent('keyup', { altKey: false, key: 'Alt' }));
    expect(overlay?.style.display).toBe('none');
  });
});
