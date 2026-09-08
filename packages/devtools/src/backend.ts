import { isDevMode } from '@angora-js/core';

export type DevToolsMode = 'full' | 'profiling' | 'disabled';

export interface DevToolsConfig {
  mode?: DevToolsMode;
  allowMutation?: boolean;
  maxHistory?: number;
  performanceMarks?: boolean;
}

export interface ComponentNode {
  id: string;
  name: string;
  selector: string;
  scopeId?: string;
  parentId?: string;
  children: string[];
  signals: Record<string, any>;
  inputs: Record<string, any>;
  outputs: string[];
  template?: string;
  renderCount?: number;
  lastRenderDuration?: number;
}

export interface SignalSnapshot {
  id: string;
  name: string;
  value: any;
  componentId?: string;
  isComputed: boolean;
  signalRef?: any;
  history: Array<{ value: any; timestamp: number }>;
}

export interface PerformanceTiming {
  name: string;
  durationMs: number;
  timestamp: number;
}

export interface DevToolsEvent {
  type:
    | 'component:mount'
    | 'component:destroy'
    | 'component:update'
    | 'hmr:update'
    | 'signal:register'
    | 'signal:update'
    | 'route:change'
    | 'timing:record';
  timestamp: number;
  payload: any;
}

export class AngoraDevToolsBackend {
  public version = '2.0.0';
  public mode: DevToolsMode;
  public allowMutation: boolean;
  public maxHistory: number;
  public performanceMarks: boolean;

  public components = new Map<string, ComponentNode>();
  public signals = new Map<string, SignalSnapshot>();
  public timings: PerformanceTiming[] = [];
  public events: DevToolsEvent[] = [];
  public activeRoute: string = '/';

  private listeners: Array<(event: DevToolsEvent) => void> = [];

  constructor(config?: DevToolsConfig) {
    const dev = isDevMode();
    // Default mode: 'full' in development, 'disabled' in production unless configured
    this.mode = config?.mode ?? (dev ? 'full' : 'disabled');
    this.allowMutation = config?.allowMutation ?? this.mode === 'full';
    this.maxHistory = config?.maxHistory ?? (this.mode === 'full' ? 50 : 0);
    this.performanceMarks = config?.performanceMarks ?? this.mode !== 'disabled';

    if (this.mode !== 'disabled' && typeof window !== 'undefined') {
      (window as any).__ANGORA_DEVTOOLS_BACKEND__ = this;
    }
  }

  public registerComponent(node: ComponentNode): void {
    if (this.mode === 'disabled') return;

    this.components.set(node.id, {
      ...node,
      renderCount: 1,
    });

    this.emit({
      type: 'component:mount',
      timestamp: Date.now(),
      payload: node,
    });
  }

  public unregisterComponent(id: string): void {
    if (this.mode === 'disabled') return;

    const node = this.components.get(id);
    if (node) {
      this.components.delete(id);
      this.emit({
        type: 'component:destroy',
        timestamp: Date.now(),
        payload: { id },
      });
    }
  }

  public registerSignal(
    id: string,
    name: string,
    initialValue: any,
    isComputed = false,
    componentId?: string
  ): void {
    if (this.mode === 'disabled') return;

    const snapshot: SignalSnapshot = {
      id,
      name,
      value: initialValue,
      componentId,
      isComputed,
      history: this.maxHistory > 0 ? [{ value: initialValue, timestamp: Date.now() }] : [],
    };
    this.signals.set(id, snapshot);
    this.emit({
      type: 'signal:register',
      timestamp: Date.now(),
      payload: snapshot,
    });
  }

  public updateSignal(id: string, nextValue: any): void {
    if (this.mode === 'disabled') return;

    const sig = this.signals.get(id);
    if (sig) {
      sig.value = nextValue;
      if (this.maxHistory > 0) {
        sig.history.push({ value: nextValue, timestamp: Date.now() });
        if (sig.history.length > this.maxHistory) sig.history.shift();
      }
      this.emit({
        type: 'signal:update',
        timestamp: Date.now(),
        payload: { id, value: nextValue },
      });
    }
  }

  /**
   * Safe mutation entrypoint called by DevTools extension panel.
   * Blocked in production / profiling mode to prevent state tampering and security risks.
   */
  public updateSignalFromDevTools(
    id: string,
    nextValue: any,
    signalRef?: { set?: (v: any) => void }
  ): boolean {
    if (this.mode !== 'full' || !this.allowMutation) {
      console.warn(
        `[Angora DevTools] State mutation is disabled in ${this.mode} mode for security and stability.`
      );
      return false;
    }

    const sig = this.signals.get(id);
    const targetRef = signalRef || sig?.signalRef;
    if (targetRef) {
      if (typeof targetRef.set === 'function') {
        targetRef.set(nextValue);
      } else if (typeof targetRef.__set === 'function') {
        targetRef.__set(nextValue);
      }
    }
    this.updateSignal(id, nextValue);
    return true;
  }

  public selectComponent(id: string): ComponentNode | null {
    const comp = this.components.get(id);
    if (!comp) return null;

    if (typeof window !== 'undefined') {
      const el = document.querySelector(`[data-angora-id="${id}"]`);
      if (el) {
        (window as any).$selectedComponent = (el as any).__angoraComponent__;
        (window as any).$0 = el;
      }
    }
    return comp;
  }

  /**
   * Records execution timing for component rendering or reactive updates.
   * Also integrates with native Chrome Performance Timeline (performance.mark / measure).
   */
  public recordTiming(name: string, durationMs: number): void {
    if (this.mode === 'disabled') return;

    const record: PerformanceTiming = {
      name,
      durationMs,
      timestamp: Date.now(),
    };
    this.timings.push(record);
    if (this.timings.length > 200) this.timings.shift();

    if (
      this.performanceMarks &&
      typeof performance !== 'undefined' &&
      typeof performance.measure === 'function'
    ) {
      try {
        const markName = `angora:${name}`;
        performance.measure(markName, { duration: durationMs });
      } catch {
        // Fallback for environments lacking measure options
      }
    }

    this.emit({
      type: 'timing:record',
      timestamp: Date.now(),
      payload: record,
    });
  }

  public setRoute(route: string): void {
    if (this.mode === 'disabled') return;

    this.activeRoute = route;
    this.emit({
      type: 'route:change',
      timestamp: Date.now(),
      payload: { route },
    });
  }

  public emit(event: DevToolsEvent): void {
    if (this.mode === 'disabled') return;

    if (event.type === 'component:update' || event.type === 'hmr:update') {
      const name = event.payload?.name;
      const compId = event.payload?.id;
      if (compId && this.components.has(compId)) {
        const comp = this.components.get(compId)!;
        comp.renderCount = (comp.renderCount || 1) + 1;
        if (event.payload.durationMs) comp.lastRenderDuration = event.payload.durationMs;
      } else if (name) {
        for (const comp of this.components.values()) {
          if (comp.name === name || comp.selector === name) {
            comp.renderCount = (comp.renderCount || 1) + 1;
            if (event.payload.durationMs) comp.lastRenderDuration = event.payload.durationMs;
          }
        }
      }
    }

    this.events.push(event);
    if (this.events.length > 200) this.events.shift();

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[Angora DevTools] Listener error:', err);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const safePayload = JSON.parse(
          JSON.stringify(event.payload, (key, value) => {
            if (typeof value === 'function') return undefined;
            if (value && typeof value === 'object' && value.nodeType) return undefined;
            return value;
          })
        );
        window.postMessage(
          { source: 'angora-devtools-backend', event: { ...event, payload: safePayload } },
          '*'
        );
      } catch {
        // Silently skip uncloneable payloads to prevent crashing the host application
      }
    }
  }

  public subscribe(listener: (event: DevToolsEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public getHierarchy(): ComponentNode[] {
    return Array.from(this.components.values());
  }

  public getSignals(): SignalSnapshot[] {
    return Array.from(this.signals.values());
  }

  public clear(): void {
    this.components.clear();
    this.signals.clear();
    this.timings = [];
    this.events = [];
  }
}

let backendInstance: AngoraDevToolsBackend | null = null;

export function configureDevTools(config: DevToolsConfig): AngoraDevToolsBackend {
  backendInstance = new AngoraDevToolsBackend(config);
  return backendInstance;
}

export function getDevToolsBackend(): AngoraDevToolsBackend {
  if (!backendInstance) {
    backendInstance = new AngoraDevToolsBackend();
  }
  return backendInstance;
}

export function resetDevToolsBackend(): void {
  if (typeof window !== 'undefined') {
    delete (window as any).__ANGORA_DEVTOOLS_BACKEND__;
  }
  backendInstance = null;
}
