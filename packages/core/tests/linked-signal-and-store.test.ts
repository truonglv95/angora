import { describe, it, expect, beforeEach } from 'bun:test';
import { signal, effect, linkedSignal, signalStore, createStore } from '../src/index.ts';
import { createErrorBoundary } from '../../runtime/src/index.ts';
import { Window } from 'happy-dom';

describe('@angora-js/core - linkedSignal() Reactive Primitive', () => {
  it('should initialize with source value and update when source signal changes', () => {
    const count = signal(1);
    const doubled = linkedSignal({
      source: () => count(),
      computation: c => c * 2,
    });

    expect(doubled()).toBe(2);

    count.set(5);
    expect(doubled()).toBe(10);
  });

  it('should allow manual override via .set() and .update()', () => {
    const user = signal({ id: 101, name: 'Alice' });
    const emailDraft = linkedSignal({
      source: () => user().id,
      computation: id => `user_${id}@angora.dev`,
    });

    expect(emailDraft()).toBe('user_101@angora.dev');

    // Manual override
    emailDraft.set('alice.custom@gmail.com');
    expect(emailDraft()).toBe('alice.custom@gmail.com');

    emailDraft.update(e => e.toUpperCase());
    expect(emailDraft()).toBe('ALICE.CUSTOM@GMAIL.COM');

    // Reset when source changes!
    user.set({ id: 202, name: 'Bob' });
    expect(emailDraft()).toBe('user_202@angora.dev');
  });

  it('should support shorthand linkedSignal(() => source())', () => {
    const selectedId = signal('item-1');
    const activeItem = linkedSignal(() => selectedId());

    expect(activeItem()).toBe('item-1');

    activeItem.set('item-custom');
    expect(activeItem()).toBe('item-custom');

    selectedId.set('item-2');
    expect(activeItem()).toBe('item-2');
  });

  it('should provide previous source and value in computation', () => {
    const step = signal(1);
    const history: string[] = [];

    const label = linkedSignal({
      source: () => step(),
      computation: (curr, prev) => {
        if (prev) {
          history.push(`Transitioned from ${prev.source} (val: ${prev.value}) to ${curr}`);
        }
        return `Step ${curr}`;
      },
    });

    expect(label()).toBe('Step 1');
    label.set('Custom Step');

    step.set(2);
    expect(label()).toBe('Step 2');
    expect(history).toContain('Transitioned from 1 (val: Custom Step) to 2');
  });
});

describe('@angora-js/core - signalStore() Fine-Grained Deep Reactive Store', () => {
  it('should read and write nested reactive properties', () => {
    const store = signalStore({
      user: {
        name: 'Alice',
        profile: {
          title: 'Staff Engineer',
        },
      },
      stats: {
        commits: 42,
      },
    });

    expect(store.user.name).toBe('Alice');
    expect(store.user.profile.title).toBe('Staff Engineer');
    expect(store.stats.commits).toBe(42);

    store.user.name = 'Bob';
    expect(store.user.name).toBe('Bob');
  });

  it('should notify only subscribers of the exact changed path', () => {
    const state = signalStore({
      auth: {
        token: 'xyz-123',
        loggedIn: true,
      },
      settings: {
        theme: 'dark',
      },
    });

    let themeRuns = 0;
    let loggedInRuns = 0;

    effect(() => {
      state.settings.theme;
      themeRuns++;
    });

    effect(() => {
      state.auth.loggedIn;
      loggedInRuns++;
    });

    expect(themeRuns).toBe(1);
    expect(loggedInRuns).toBe(1);

    // Changing theme should only run theme effect
    state.settings.theme = 'light';
    expect(themeRuns).toBe(2);
    expect(loggedInRuns).toBe(1);

    // Changing loggedIn should only run auth effect
    state.auth.loggedIn = false;
    expect(themeRuns).toBe(2);
    expect(loggedInRuns).toBe(2);
  });

  it('should support createStore alias for signalStore', () => {
    const app = createStore({ count: 0 });
    let observed = 0;

    effect(() => {
      observed = app.count;
    });

    expect(observed).toBe(0);
    app.count = 10;
    expect(observed).toBe(10);
  });
});

describe('@angora-js/runtime - createErrorBoundary() Fault Tolerance', () => {
  let window: Window;
  let document: Document;
  let container: HTMLElement;

  beforeEach(() => {
    window = new Window();
    document = window.document as unknown as Document;
    (globalThis as any).document = document;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('should render children normally when no error occurs', () => {
    const anchor = document.createComment('boundary');
    container.appendChild(anchor);

    createErrorBoundary(anchor, {
      children: () => {
        const el = document.createElement('h1');
        el.textContent = 'App Content Safe';
        return [el];
      },
      fallback: err => {
        const errEl = document.createElement('div');
        errEl.textContent = 'Error: ' + err.message;
        return [errEl];
      },
    });

    expect(container.innerHTML).toContain('App Content Safe');
  });

  it('should catch error, render fallback, and allow recovery via retry()', () => {
    const anchor = document.createComment('boundary');
    container.appendChild(anchor);

    let shouldFail = true;

    createErrorBoundary(anchor, {
      children: () => {
        if (shouldFail) {
          throw new Error('Crash in Child Component');
        }
        const successEl = document.createElement('div');
        successEl.id = 'recovered';
        successEl.textContent = 'Recovered successfully!';
        return [successEl];
      },
      fallback: (err, retry) => {
        const fallbackEl = document.createElement('div');
        fallbackEl.id = 'fallback';
        fallbackEl.textContent = `Caught: ${err.message}`;

        const retryBtn = document.createElement('button');
        retryBtn.id = 'retry-btn';
        retryBtn.addEventListener('click', () => {
          shouldFail = false;
          retry();
        });
        fallbackEl.appendChild(retryBtn);

        return [fallbackEl];
      },
    });

    expect(container.querySelector('#fallback')?.textContent).toContain('Crash in Child Component');
    expect(container.querySelector('#recovered')).toBeNull();

    // Click retry button to recover
    const btn = container.querySelector('#retry-btn') as HTMLButtonElement;
    btn.click();

    expect(container.querySelector('#fallback')).toBeNull();
    expect(container.querySelector('#recovered')?.textContent).toBe('Recovered successfully!');
  });
});
