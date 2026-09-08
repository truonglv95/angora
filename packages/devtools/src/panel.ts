import type { ComponentNode, SignalSnapshot, DevToolsEvent } from './backend.ts';

declare const chrome: any;

class DevToolsPanelController {
  private activeTab = 'components';
  private components: ComponentNode[] = [];
  private signals: SignalSnapshot[] = [];
  private events: DevToolsEvent[] = [];
  private selectedComponentId: string | null = null;
  private filterQuery = '';

  constructor() {
    this.setupTabs();
    this.setupSearch();
    this.setupListeners();
    this.loadState();

    // Periodic state synchronization in dev mode
    setInterval(() => {
      this.loadState(true);
    }, 1200);
  }

  private setupTabs(): void {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab || 'components';
        this.switchTab(tab);
      });
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => {
      this.loadState();
    });

    document.getElementById('btn-clear')?.addEventListener('click', () => {
      this.events = [];
      this.renderEvents();
    });
  }

  private setupSearch(): void {
    const searchInput = document.getElementById('signal-search') as HTMLInputElement | null;
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        this.filterQuery = (e.target as HTMLInputElement).value.toLowerCase();
        this.renderSignals();
      });
    }
  }

  private switchTab(tabName: string): void {
    this.activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabName}`);
    });
  }

  private setupListeners(): void {
    // 1. Listen for background relay port if running in Chrome Extension
    if (typeof chrome !== 'undefined' && chrome.devtools && chrome.runtime) {
      try {
        const tabId = chrome.devtools.inspectedWindow.tabId;
        const port = chrome.runtime.connect({ name: 'angora-devtools-panel' });
        port.postMessage({ action: 'init', tabId });
        port.onMessage.addListener((message: any) => {
          if (message && message.source === 'angora-devtools-content' && message.event) {
            this.handleBackendEvent(message.event);
          }
        });
      } catch (err) {
        console.warn('[Angora DevTools] Failed to connect runtime port:', err);
      }
    }

    // 2. Direct window message event fallback (standalone testing)
    if (typeof window !== 'undefined') {
      window.addEventListener('message', event => {
        if (event.data && event.data.source === 'angora-devtools-backend') {
          this.handleBackendEvent(event.data.event);
        }
      });
    }
  }

  public handleBackendEvent(event: DevToolsEvent): void {
    this.events.unshift(event);
    if (this.events.length > 100) this.events.pop();

    if (event.type === 'component:mount') {
      const idx = this.components.findIndex(c => c.id === event.payload.id);
      if (idx >= 0) {
        this.components[idx] = event.payload;
      } else {
        this.components.push(event.payload);
      }
      this.renderComponents();
    } else if (event.type === 'component:destroy') {
      this.components = this.components.filter(c => c.id !== event.payload.id);
      if (this.selectedComponentId === event.payload.id) {
        this.selectedComponentId = this.components[0]?.id || null;
      }
      this.renderComponents();
    } else if (event.type === 'signal:register') {
      const idx = this.signals.findIndex(s => s.id === event.payload.id);
      if (idx >= 0) {
        this.signals[idx] = event.payload;
      } else {
        this.signals.push(event.payload);
      }
      this.renderSignals();
    } else if (event.type === 'signal:update') {
      const sig = this.signals.find(s => s.id === event.payload.id);
      if (sig) {
        sig.value = event.payload.value;
        sig.history.push({ value: event.payload.value, timestamp: event.timestamp });
        if (sig.history.length > 50) sig.history.shift();
      }
      this.renderSignals();
      if (this.selectedComponentId) {
        const comp = this.components.find(c => c.id === this.selectedComponentId);
        if (comp) this.renderComponentDetail(comp);
      }
    } else if (event.type === 'component:update' || event.type === 'hmr:update') {
      const name = event.payload?.name;
      const compId = event.payload?.id;
      for (const comp of this.components) {
        if ((compId && comp.id === compId) || comp.name === name || comp.selector === name) {
          comp.renderCount = (comp.renderCount || 1) + 1;
          if (event.payload?.durationMs) comp.lastRenderDuration = event.payload.durationMs;
        }
      }
      this.renderComponents();
      if (this.selectedComponentId) {
        const comp = this.components.find(c => c.id === this.selectedComponentId);
        if (comp) this.renderComponentDetail(comp);
      }
    } else if (event.type === 'route:change') {
      const el = document.getElementById('router-active-route');
      if (el) el.textContent = event.payload.route;
    }

    this.renderEvents();
  }

  public loadState(silent = false): void {
    if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.inspectedWindow) {
      chrome.devtools.inspectedWindow.eval(
        `(() => {
          const b = window.__ANGORA_DEVTOOLS_BACKEND__;
          let components = b && b.getHierarchy ? b.getHierarchy() : [];
          let signals = b && b.getSignals ? b.getSignals() : [];
          let events = b && b.events ? [...b.events] : [];
          let activeRoute = b ? b.activeRoute : (window.location.pathname || '/');

          return {
            components,
            signals,
            events,
            activeRoute,
          };
        })()`,
        (result: any, isException: any) => {
          if (!isException && result) {
            this.components = result.components || [];
            this.signals = result.signals || [];
            this.events = result.events || [];
            if (result.activeRoute) {
              const el = document.getElementById('router-active-route');
              if (el) el.textContent = result.activeRoute;
            }
            this.renderComponents();
            this.renderSignals();
            this.renderEvents();
          } else if (!silent) {
            const list = document.getElementById('component-tree');
            if (list && this.components.length === 0) {
              list.innerHTML =
                '<li class="empty-state">No Angora application detected on this page.<br/>(Ensure dev mode is active)</li>';
            }
          }
        }
      );
    } else {
      const backend = (window as any).__ANGORA_DEVTOOLS_BACKEND__;
      if (backend) {
        this.components = backend.getHierarchy();
        this.signals = backend.getSignals();
        this.events = [...backend.events];
        this.renderComponents();
        this.renderSignals();
        this.renderEvents();
      }
    }
  }

  private renderComponents(): void {
    const list = document.getElementById('component-tree');
    if (!list) return;

    if (this.components.length === 0) {
      list.innerHTML = '<li class="empty-state">No components mounted.</li>';
      return;
    }

    // Build hierarchy map
    const childrenMap = new Map<string, ComponentNode[]>();
    const rootNodes: ComponentNode[] = [];
    const allIds = new Set(this.components.map(c => c.id));

    for (const comp of this.components) {
      if (comp.parentId && allIds.has(comp.parentId)) {
        if (!childrenMap.has(comp.parentId)) childrenMap.set(comp.parentId, []);
        childrenMap.get(comp.parentId)!.push(comp);
      } else {
        rootNodes.push(comp);
      }
    }

    const renderNode = (c: ComponentNode, depth: number): string => {
      const isSelected = this.selectedComponentId === c.id;
      const children = childrenMap.get(c.id) || [];
      const hasChildren = children.length > 0;
      const indent = depth * 16;

      let html = `<li class="tree-item ${isSelected ? 'selected' : ''}" data-id="${c.id}" style="padding-left: ${indent + 8}px; display: flex; align-items: center; gap: 6px; cursor: pointer; padding-top: 6px; padding-bottom: 6px;">
        <span class="icon" style="font-size: 14px;">${hasChildren ? '📂' : '📦'}</span>
        <span class="name" style="font-weight: 600; color: var(--text-primary);">&lt;${c.name}&gt;</span>
        <span class="selector" style="color: var(--text-secondary); font-size: 11px;">(${c.selector})</span>
      </li>`;

      for (const child of children) {
        html += renderNode(child, depth + 1);
      }
      return html;
    };

    let fullHtml = '';
    for (const root of rootNodes) {
      fullHtml += renderNode(root, 0);
    }
    list.innerHTML = fullHtml;

    list.querySelectorAll('.tree-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = (item as HTMLElement).dataset.id;
        if (!id) return;
        this.selectedComponentId = id;
        this.selectComponent(id);
        this.renderComponents();
      });
    });

    if (this.selectedComponentId) {
      const comp = this.components.find(c => c.id === this.selectedComponentId);
      if (comp) this.renderComponentDetail(comp);
    } else if (this.components.length > 0) {
      this.selectedComponentId = this.components[0].id;
      this.selectComponent(this.components[0].id);
      this.renderComponents();
    }
  }

  private selectComponent(id: string): void {
    const comp = this.components.find(c => c.id === id);
    if (!comp) return;

    if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.inspectedWindow) {
      chrome.devtools.inspectedWindow.eval(
        `window.__ANGORA_DEVTOOLS_BACKEND__?.selectComponent(${JSON.stringify(id)})`
      );
    }
    this.renderComponentDetail(comp);
  }

  private renderComponentDetail(comp: ComponentNode): void {
    const detail = document.getElementById('component-detail');
    if (!detail) return;

    // Filter signals relevant to this component
    const compSignals = this.signals.filter(
      s => s.componentId === comp.id || (comp.signals && s.name in comp.signals)
    );

    let signalsHtml = '';
    if (compSignals.length === 0) {
      signalsHtml =
        '<p class="empty-state" style="padding: 0.5rem 0;">No signals declared on this component.</p>';
    } else {
      signalsHtml = `
        <table class="signals-table" style="width: 100%; border-collapse: collapse; margin-top: 0.5rem;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); text-align: left; font-size: 11px; color: var(--text-secondary);">
              <th style="padding: 4px;">Signal</th>
              <th style="padding: 4px;">Type</th>
              <th style="padding: 4px;">Live Value</th>
              <th style="padding: 4px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${compSignals
              .map(
                s => `<tr style="border-bottom: 1px solid var(--border);">
                  <td style="padding: 6px 4px;"><strong>${s.name}</strong></td>
                  <td style="padding: 6px 4px;"><span class="badge" style="background: ${s.isComputed ? '#8b5cf6' : '#6366f1'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${s.isComputed ? 'computed()' : 'signal()'}</span></td>
                  <td style="padding: 6px 4px;"><code style="background: var(--bg-card); padding: 2px 6px; border-radius: 4px; font-size: 12px;">${JSON.stringify(s.value)}</code></td>
                  <td style="padding: 6px 4px; text-align: right;">
                    ${!s.isComputed ? `<button class="edit-comp-sig-btn" data-sig-id="${s.id}" data-sig-name="${s.name}" style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Edit</button>` : ''}
                    ${!s.isComputed && s.history && s.history.length > 1 ? `<button class="revert-comp-sig-btn" data-sig-id="${s.id}" data-sig-name="${s.name}" style="background: var(--bg-card); border: 1px solid #6366f1; color: #818cf8; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 4px;">⏪ Revert</button>` : ''}
                  </td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      `;
    }

    const inputKeys = Object.keys(comp.inputs || {});
    let inputsHtml = '';
    if (inputKeys.length === 0) {
      inputsHtml = '<p class="empty-state" style="padding: 0.5rem 0;">No inputs received.</p>';
    } else {
      inputsHtml = `<pre style="background: var(--bg-secondary); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; overflow-x: auto; font-size: 12px;">${JSON.stringify(comp.inputs, null, 2)}</pre>`;
    }

    let outputsHtml = '';
    if (!comp.outputs || comp.outputs.length === 0) {
      outputsHtml = '<p class="empty-state" style="padding: 0.5rem 0;">No outputs registered.</p>';
    } else {
      outputsHtml = `<div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">${comp.outputs.map(o => `<span class="badge" style="background: #0ea5e9; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${o}</span>`).join('')}</div>`;
    }

    let templateHtml = '';
    if (comp.template) {
      templateHtml = `
        <details style="margin-top: 1rem;">
          <summary style="cursor: pointer; font-weight: 600; color: var(--text-primary); font-size: 13px;">Template Source Code</summary>
          <pre style="background: var(--bg-secondary); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; overflow-x: auto; font-size: 12px; max-height: 220px; line-height: 1.4;">${comp.template.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </details>
      `;
    }

    detail.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-primary);">&lt;${comp.name}&gt;</h3>
        <button id="btn-inspect-dom" style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">🔍 Inspect Element</button>
      </div>
      <p style="margin: 0.35rem 0; color: var(--text-secondary); font-size: 12px;">
        <strong>Selector:</strong> <code>${comp.selector}</code>
        ${comp.scopeId ? ` | <strong>Scope ID:</strong> <code>${comp.scopeId}</code>` : ''}
      </p>
      <p style="margin: 0.25rem 0; color: #a1a1aa; font-size: 11px;">💡 In Console, access this instance via <code>$selectedComponent</code> or element via <code>$0</code></p>
      
      <hr style="margin: 0.75rem 0; border: 0; border-top: 1px solid var(--border);" />
      <h4 style="margin: 0.5rem 0 0.25rem 0; font-size: 13px;">Signals & Live Reactive State</h4>
      ${signalsHtml}

      <h4 style="margin: 1rem 0 0.25rem 0; font-size: 13px;">Inputs</h4>
      ${inputsHtml}

      <h4 style="margin: 1rem 0 0.25rem 0; font-size: 13px;">Outputs</h4>
      ${outputsHtml}

      ${templateHtml}
    `;

    document.getElementById('btn-inspect-dom')?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.inspectedWindow) {
        chrome.devtools.inspectedWindow.eval(
          `inspect(document.querySelector('[data-angora-id="${comp.id}"]'))`
        );
      }
    });

    detail.querySelectorAll('.edit-comp-sig-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sigId = (btn as HTMLElement).dataset.sigId;
        const sigName = (btn as HTMLElement).dataset.sigName;
        if (!sigId || !sigName) return;
        const sig = this.signals.find(s => s.id === sigId);
        const currentVal = sig ? sig.value : undefined;
        const nextValStr = prompt(`Update signal "${sigName}":`, JSON.stringify(currentVal));
        if (nextValStr !== null) {
          try {
            const parsed = JSON.parse(nextValStr);
            this.updateSignalValue(sigId, parsed);
          } catch {
            this.updateSignalValue(sigId, nextValStr);
          }
        }
      });
    });

    detail.querySelectorAll('.revert-comp-sig-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sigId = (btn as HTMLElement).dataset.sigId;
        const sigName = (btn as HTMLElement).dataset.sigName;
        if (!sigId) return;
        const sig = this.signals.find(s => s.id === sigId);
        if (!sig || !sig.history || sig.history.length <= 1) return;

        const historySteps = sig.history
          .map(
            (h, idx) =>
              `[Step ${idx}]: ${JSON.stringify(h.value)} (${new Date(h.timestamp).toLocaleTimeString()})`
          )
          .join('\n');

        const stepStr = prompt(
          `Time-Travel Signal "${sigName || sigId}"\nEnter step index to revert (0 to ${sig.history.length - 1}):\n\n${historySteps}`,
          String(sig.history.length - 2)
        );

        if (stepStr !== null) {
          const step = parseInt(stepStr, 10);
          if (!isNaN(step) && step >= 0 && step < sig.history.length) {
            this.timeTravelSignal(sigId, step);
          }
        }
      });
    });
  }

  private renderSignals(): void {
    const tbody = document.getElementById('signals-tbody');
    const countEl = document.getElementById('signal-count');
    if (countEl) countEl.textContent = `${this.signals.length} active signals`;
    if (!tbody) return;

    const filtered = this.signals.filter(
      s =>
        s.name.toLowerCase().includes(this.filterQuery) ||
        s.id.toLowerCase().includes(this.filterQuery)
    );

    if (filtered.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 1rem;">No signals found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered
      .map(
        s => `<tr>
          <td><strong>${s.name}</strong> <span style="color: var(--text-secondary); font-size: 11px;">(${s.id})</span></td>
          <td><span class="badge" style="background: ${s.isComputed ? '#8b5cf6' : '#6366f1'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${s.isComputed ? 'computed()' : 'signal()'}</span></td>
          <td><code style="background: var(--bg-card); padding: 2px 6px; border-radius: 4px;">${JSON.stringify(s.value)}</code></td>
          <td>${s.history ? s.history.length : 0}</td>
          <td>
            ${!s.isComputed ? `<button class="edit-btn" data-id="${s.id}" style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); padding: 2px 8px; border-radius: 4px; cursor: pointer;">Edit</button>` : ''}
            ${!s.isComputed && s.history && s.history.length > 1 ? `<button class="revert-btn" data-id="${s.id}" style="background: var(--bg-card); border: 1px solid #6366f1; color: #818cf8; padding: 2px 8px; border-radius: 4px; cursor: pointer; margin-left: 4px;">⏪ Revert</button>` : ''}
          </td>
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        const sig = this.signals.find(s => s.id === id);
        if (!sig) return;

        const currentJson = JSON.stringify(sig.value);
        const nextValStr = prompt(`Update signal "${sig.name}" (${sig.id}):`, currentJson);
        if (nextValStr !== null) {
          try {
            const parsed = JSON.parse(nextValStr);
            this.updateSignalValue(sig.id, parsed);
          } catch {
            this.updateSignalValue(sig.id, nextValStr);
          }
        }
      });
    });

    tbody.querySelectorAll('.revert-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (!id) return;
        const sig = this.signals.find(s => s.id === id);
        if (!sig || !sig.history || sig.history.length <= 1) return;

        const historySteps = sig.history
          .map(
            (h, idx) =>
              `[Step ${idx}]: ${JSON.stringify(h.value)} (${new Date(h.timestamp).toLocaleTimeString()})`
          )
          .join('\n');

        const stepStr = prompt(
          `Time-Travel Signal "${sig.name}" (${sig.id})\nEnter step index to revert (0 to ${sig.history.length - 1}):\n\n${historySteps}`,
          String(sig.history.length - 2)
        );

        if (stepStr !== null) {
          const step = parseInt(stepStr, 10);
          if (!isNaN(step) && step >= 0 && step < sig.history.length) {
            this.timeTravelSignal(id, step);
          }
        }
      });
    });
  }

  private timeTravelSignal(id: string, historyIndex: number): void {
    if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.inspectedWindow) {
      chrome.devtools.inspectedWindow.eval(
        `window.__ANGORA_DEVTOOLS_BACKEND__?.timeTravelSignal(${JSON.stringify(id)}, ${historyIndex})`,
        () => {
          this.loadState();
        }
      );
    } else {
      const backend = (window as any).__ANGORA_DEVTOOLS_BACKEND__;
      if (backend) {
        backend.timeTravelSignal(id, historyIndex);
        this.loadState();
      }
    }
  }

  private updateSignalValue(id: string, value: any): void {
    if (typeof chrome !== 'undefined' && chrome.devtools && chrome.devtools.inspectedWindow) {
      chrome.devtools.inspectedWindow.eval(
        `window.__ANGORA_DEVTOOLS_BACKEND__?.updateSignalFromDevTools(${JSON.stringify(id)}, ${JSON.stringify(value)})`,
        () => {
          this.loadState();
        }
      );
    } else {
      const backend = (window as any).__ANGORA_DEVTOOLS_BACKEND__;
      if (backend) {
        backend.updateSignalFromDevTools(id, value);
        this.loadState();
      }
    }
  }

  private renderEvents(): void {
    const stream = document.getElementById('event-stream');
    if (!stream) return;

    if (this.events.length === 0) {
      stream.innerHTML =
        '<div style="color: var(--text-secondary); text-align: center; padding: 1rem;">No mutations recorded.</div>';
      return;
    }

    stream.innerHTML = this.events
      .map(
        e => `<div class="stream-entry" style="padding: 4px 0; border-bottom: 1px solid var(--border);">
          <span class="type" style="color: #60a5fa; font-weight: 600;">${e.type}</span>
          <span class="time" style="color: var(--text-secondary); font-size: 11px; margin-left: 8px;">${new Date(e.timestamp).toLocaleTimeString()}</span>
        </div>`
      )
      .join('');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    new DevToolsPanelController();
  });
}
