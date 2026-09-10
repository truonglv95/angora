import { bootstrapApplication, type BootstrapOptions } from '@angora-js/runtime';
import { TRANSFER_STATE, TransferState } from './context.ts';

export interface HydrateOptions extends BootstrapOptions {
  replayEvents?: boolean;
}

/**
 * Replays events captured by the event replay buffer during streaming SSR
 */
export function replayQueuedEvents(): number {
  if (typeof window === 'undefined') return 0;
  const events = (window as any).__ANGORA_EVENTS__ as
    | Array<{ type: string; target: HTMLElement; event: any }>
    | undefined;
  if (!events || events.length === 0) return 0;

  let replayed = 0;
  for (const item of events) {
    if (item.target && typeof item.target.dispatchEvent === 'function') {
      try {
        const synthetic = new (window as any).Event(item.type, {
          bubbles: true,
          cancelable: true,
        });
        item.target.dispatchEvent(synthetic);
        replayed++;
      } catch (e) {
        // ignore replay errors
      }
    }
  }
  // Clear buffer
  (window as any).__ANGORA_EVENTS__ = [];
  return replayed;
}

/**
 * Hydrates an existing server-rendered Angora application on the client.
 * Restores TransferState data transferred from the server, activates reactive signals,
 * and replays queued user events.
 *
 * @example
 * hydrateApplication(AppComponent, '#app');
 */
export function hydrateApplication<T>(
  componentType: new (...args: any[]) => T,
  container: HTMLElement | string,
  options: HydrateOptions = {}
): T {
  const transferState = new TransferState();

  // Read transferred state from server-injected script
  if (typeof document !== 'undefined') {
    const stateElement = document.getElementById('__ANGORA_TRANSFER_STATE__');
    if (stateElement && stateElement.textContent) {
      transferState.fromJson(stateElement.textContent);
      // Clean up script tag
      stateElement.parentNode?.removeChild(stateElement);
    }
  }

  const clientProviders = [
    { provide: TRANSFER_STATE, useValue: transferState },
    ...(options.providers || []),
  ];

  const app = bootstrapApplication(componentType, container, {
    ...options,
    providers: clientProviders,
    hydrate: true,
  });

  if (options.replayEvents !== false) {
    replayQueuedEvents();
  }

  return app;
}

export type IslandHydrationStrategy =
  | 'load'
  | 'idle'
  | 'visible'
  | { media: string }
  | { event: string };

/**
 * Hydrates an isolated island component based on fine-grained triggers
 * ('load', 'idle', 'visible', { media }, or { event }).
 * Ideal for Islands Architecture and selective partial hydration.
 *
 * @example
 * // Hydrate when visible in viewport:
 * hydrateIsland(CommentsIsland, '#comments-island', 'visible');
 *
 * // Hydrate when browser is idle:
 * hydrateIsland(AnalyticsWidget, '#analytics', 'idle');
 *
 * // Hydrate on user hover or click:
 * hydrateIsland(DropdownMenu, '#menu', { event: 'pointerenter' });
 */
export function hydrateIsland<T>(
  componentType: new (...args: any[]) => T,
  container: HTMLElement | string,
  strategy: IslandHydrationStrategy = 'load',
  options: HydrateOptions = {}
): Promise<T> {
  const targetElement =
    typeof container === 'string'
      ? typeof document !== 'undefined'
        ? document.querySelector<HTMLElement>(container)
        : null
      : container;

  const hydrate = () => hydrateApplication(componentType, container, options);

  if (typeof window === 'undefined' || !targetElement) {
    return Promise.resolve(hydrate());
  }

  if (strategy === 'load') {
    return Promise.resolve(hydrate());
  }

  return new Promise<T>(resolve => {
    if (strategy === 'idle') {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => resolve(hydrate()));
      } else {
        setTimeout(() => resolve(hydrate()), 200);
      }
      return;
    }

    if (strategy === 'visible') {
      if ('IntersectionObserver' in window) {
        const observer = new (window as any).IntersectionObserver(
          (entries: any[]) => {
            if (entries.some(e => e.isIntersecting)) {
              observer.disconnect();
              resolve(hydrate());
            }
          },
          { rootMargin: '50px' }
        );
        observer.observe(targetElement);
      } else {
        resolve(hydrate());
      }
      return;
    }

    if (typeof strategy === 'object' && 'media' in strategy) {
      if ('matchMedia' in window) {
        const mql = window.matchMedia(strategy.media);
        if (mql.matches) {
          resolve(hydrate());
        } else {
          const handler = (e: MediaQueryListEvent) => {
            if (e.matches) {
              mql.removeEventListener('change', handler);
              resolve(hydrate());
            }
          };
          mql.addEventListener('change', handler);
        }
      } else {
        resolve(hydrate());
      }
      return;
    }

    if (typeof strategy === 'object' && 'event' in strategy) {
      const eventName = strategy.event;
      const handler = () => {
        targetElement.removeEventListener(eventName, handler);
        resolve(hydrate());
      };
      targetElement.addEventListener(eventName, handler, { once: true, passive: true });
      return;
    }

    resolve(hydrate());
  });
}
