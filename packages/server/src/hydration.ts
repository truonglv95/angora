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
    providers: clientProviders,
  });

  if (options.replayEvents !== false) {
    replayQueuedEvents();
  }

  return app;
}
