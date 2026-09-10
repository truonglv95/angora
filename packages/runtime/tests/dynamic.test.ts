import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import '@angora-js/compiler';
import { Component, signal, input, inject, DESTROY_REF, type DestroyRef } from '@angora-js/core';
import {
  createElement,
  createText,
  createComment,
  createSwitch,
  createDynamicComponent,
  bindText,
  COMPONENT_DEF,
} from '../src/index.ts';

let doc: Document;

beforeEach(() => {
  const window = new Window();
  doc = window.document as any;
  (globalThis as any).document = doc;
  (globalThis as any).window = window;
  (globalThis as any).Node = window.Node;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).Comment = window.Comment;
});

// Test component A
@Component({
  selector: 'tab-overview',
})
class TabOverviewComponent {
  public title = input('Default Overview');
  public destroyed = false;

  constructor() {
    const destroyRef = inject(DESTROY_REF);
    destroyRef.onDestroy(() => {
      this.destroyed = true;
    });
  }
}
(TabOverviewComponent as any)[COMPONENT_DEF] = {
  selector: 'tab-overview',
  render: (ctx: TabOverviewComponent) => {
    const p = createElement('p');
    p.className = 'overview-content';
    bindText(p, () => ctx.title());
    return [p];
  },
};

// Test component B
@Component({
  selector: 'tab-settings',
})
class TabSettingsComponent {
  public count = input(0);
}
(TabSettingsComponent as any)[COMPONENT_DEF] = {
  selector: 'tab-settings',
  render: (ctx: TabSettingsComponent) => {
    const span = createElement('span');
    span.className = 'settings-content';
    span.textContent = `Settings count: ${ctx.count()}`;
    return [span];
  },
};

describe('@angora-js/runtime - Dynamic Component Engine', () => {
  test('should dynamically mount synchronous component based on signal', () => {
    const container = createElement('div');
    const anchor = createComment('angora:dynamic');
    container.appendChild(anchor);

    const currentTab = signal<any>(TabOverviewComponent);
    const cleanup = createDynamicComponent(anchor, () => currentTab());

    expect(container.querySelector('tab-overview')).not.toBeNull();
    expect(container.querySelector('.overview-content')?.textContent).toBe('Default Overview');

    // Switch to TabSettingsComponent
    currentTab.set(TabSettingsComponent);
    expect(container.querySelector('tab-overview')).toBeNull();
    expect(container.querySelector('tab-settings')).not.toBeNull();
    expect(container.querySelector('.settings-content')?.textContent).toBe('Settings count: 0');

    // Switch to null (unmount)
    currentTab.set(null);
    expect(container.querySelector('tab-settings')).toBeNull();
    expect(container.childNodes.length).toBe(1); // only anchor

    cleanup();
  });

  test('should dynamically pass and update reactive inputs to active component', () => {
    const container = createElement('div');
    const anchor = createComment('angora:dynamic');
    container.appendChild(anchor);

    const currentTab = signal<any>(TabOverviewComponent);
    const title = signal('Custom Title 1');

    const cleanup = createDynamicComponent(
      anchor,
      () => currentTab(),
      () => ({ title: title() })
    );

    const overviewEl = container.querySelector('tab-overview');
    expect(overviewEl).not.toBeNull();
    // Wait for effect or check text
    const p = overviewEl?.querySelector('.overview-content');
    expect(p?.textContent).toBe('Custom Title 1');

    // Update title signal
    title.set('Updated Title 2');
    // Reactivity updates signal input
    expect(p?.textContent).toBe('Updated Title 2');

    cleanup();
  });

  test('should trigger onDestroy when dynamic component is replaced or unmounted', () => {
    const container = createElement('div');
    const anchor = createComment('angora:dynamic');
    container.appendChild(anchor);

    let createdInstance: TabOverviewComponent | null = null;
    class TrackableOverview extends TabOverviewComponent {
      constructor() {
        super();
        createdInstance = this;
      }
    }
    (TrackableOverview as any)[COMPONENT_DEF] = (TabOverviewComponent as any)[COMPONENT_DEF];

    const currentTab = signal<any>(TrackableOverview);
    const cleanup = createDynamicComponent(anchor, () => currentTab());

    expect(createdInstance).not.toBeNull();
    expect((createdInstance as any)!.destroyed).toBe(false);

    // Switch component -> triggers destroy of old component
    currentTab.set(TabSettingsComponent);
    expect((createdInstance as any)!.destroyed).toBe(true);

    cleanup();
  });

  test('should dynamically load asynchronous lazy component via Promise', async () => {
    const container = createElement('div');
    const anchor = createComment('angora:dynamic');
    container.appendChild(anchor);

    // Lazy load mock component
    const lazyComponentPromise = Promise.resolve({
      default: TabSettingsComponent,
    });

    const currentTab = signal<any>(lazyComponentPromise);

    const cleanup = createDynamicComponent(anchor, () => currentTab(), {
      loadingRenderer: () => {
        const loadingSpan = createElement('span');
        loadingSpan.className = 'loading-indicator';
        loadingSpan.textContent = 'Loading lazy component...';
        return [loadingSpan];
      },
    });

    // Before promise resolves: loading indicator is displayed
    expect(container.querySelector('.loading-indicator')?.textContent).toBe(
      'Loading lazy component...'
    );

    // Wait for promise tick
    await lazyComponentPromise;
    await new Promise(r => setTimeout(r, 10));

    // After resolution: loading indicator is removed, component is mounted
    expect(container.querySelector('.loading-indicator')).toBeNull();
    expect(container.querySelector('tab-settings')).not.toBeNull();

    cleanup();
  });

  test('should handle multi-value array matching and predicate matching in createSwitch', () => {
    const container = createElement('div');
    const anchor = createComment('angora:switch');
    container.appendChild(anchor);

    const role = signal<string>('guest');

    createSwitch(anchor, () => role(), [
      {
        caseValue: ['admin', 'superadmin', 'owner'],
        render: () => {
          const badge = createElement('span');
          badge.className = 'badge-privileged';
          badge.textContent = 'Privileged Access';
          return [badge];
        },
      },
      {
        caseValue: (val: string) => val.startsWith('team-'),
        render: () => {
          const badge = createElement('span');
          badge.className = 'badge-team';
          badge.textContent = 'Team Member';
          return [badge];
        },
      },
      {
        caseValue: 'moderator',
        render: () => {
          const badge = createElement('span');
          badge.className = 'badge-mod';
          badge.textContent = 'Moderator';
          return [badge];
        },
      },
      {
        render: () => {
          const badge = createElement('span');
          badge.className = 'badge-default';
          badge.textContent = 'Standard User';
          return [badge];
        },
      },
    ]);

    expect(container.querySelector('.badge-default')?.textContent).toBe('Standard User');

    // Match multi-value array (admin)
    role.set('admin');
    expect(container.querySelector('.badge-privileged')?.textContent).toBe('Privileged Access');

    // Match multi-value array (owner)
    role.set('owner');
    expect(container.querySelector('.badge-privileged')?.textContent).toBe('Privileged Access');

    // Match predicate function (team-dev)
    role.set('team-dev');
    expect(container.querySelector('.badge-team')?.textContent).toBe('Team Member');

    // Match single value (moderator)
    role.set('moderator');
    expect(container.querySelector('.badge-mod')?.textContent).toBe('Moderator');

    // Fallback to default
    role.set('anonymous');
    expect(container.querySelector('.badge-default')?.textContent).toBe('Standard User');
  });
});
