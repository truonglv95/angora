/**
 * DevTools Extension Bridge for Angora applications
 * Provides runtime hooks for profiling signals, component hierarchy, and change detection.
 */

export interface DevToolsHook {
  version: string;
  signals: Map<string, any>;
  components: Set<any>;
  events: Array<{ type: string; timestamp: number; data: any }>;
  emit(type: string, data: any): void;
}

declare global {
  interface Window {
    __ANGORA_DEVTOOLS__?: DevToolsHook;
  }
}

/**
 * Initializes or retrieves the global Angora DevTools hook
 */
export function getDevTools(): DevToolsHook | null {
  if (typeof window === 'undefined') return null;

  if (!window.__ANGORA_DEVTOOLS__) {
    const events: Array<{ type: string; timestamp: number; data: any }> = [];
    const signals = new Map<string, any>();
    const components = new Set<any>();

    window.__ANGORA_DEVTOOLS__ = {
      version: '0.1.0',
      signals,
      components,
      events,
      emit(type: string, data: any) {
        events.push({ type, timestamp: Date.now(), data });
      },
    };
  }

  return window.__ANGORA_DEVTOOLS__;
}

/**
 * Emits a signal mutation event to Angora DevTools
 */
export function recordSignalUpdate(name: string, prevValue: any, nextValue: any): void {
  const devtools = getDevTools();
  if (devtools) {
    devtools.emit('signal:update', { name, prevValue, nextValue });
  }
}
