import { Component, signal, computed, linkedSignal, signalStore } from '@angora-js/core';
import { toSignal } from '@angora-js/rxjs-interop';
import { TodoItemComponent, type Todo } from '../todo-item.component.ts';
import CounterSfc from '../counter-sfc.angora';

// Simulated RxJS-compatible stream (Observables / Subscribable)
const liveStream$ = {
  subscribe(observer: { next: (val: number) => void }) {
    let val = 120.45;
    const intervalId = setInterval(() => {
      val += (Math.random() - 0.48) * 1.5;
      observer.next(parseFloat(val.toFixed(2)));
    }, 1500);
    return {
      unsubscribe() {
        clearInterval(intervalId);
      },
    };
  },
};

@Component({
  selector: 'app-dashboard',
  imports: [TodoItemComponent, CounterSfc],
  template: `
    <div class="dashboard-view">
      <!-- Welcome Hero Banner -->
      <div class="panel-card" style="background: linear-gradient(135deg, rgba(79,70,229,0.08) 0%, rgba(6,182,212,0.08) 100%);">
        <h1 style="margin: 0 0 0.5rem 0; font-size: 1.75rem; color: var(--angora-primary);">
          🚀 Angora Reactive Control Center
        </h1>
        <p style="margin: 0; color: var(--angora-text-secondary); line-height: 1.6;">
          Demonstrating fine-grained signals, zero-VDOM reactivity, modern Angular control flow,
          RxJS interop, and Enterprise design tokens.
        </p>
      </div>

      <!-- Reactive Stat Grid -->
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">Reactive Counter</span>
          <span class="stat-value">{{ count() }}</span>
          <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
            <button class="btn btn-primary" (click)="increment()">+ Increment</button>
            <button class="btn btn-secondary" (click)="reset()">Reset</button>
          </div>
        </div>

        <div class="stat-card">
          <span class="stat-label">Computed (2x)</span>
          <span class="stat-value" style="color: var(--angora-primary);">{{ double() }}</span>
          <span class="form-hint">Derived zero-overhead signal</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">RxJS Stream toSignal()</span>
          <span class="stat-value" style="color: var(--angora-success);">\${{ liveStock() }}</span>
          <span class="badge badge-success">Live Ticker Active</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">linkedSignal()</span>
          <span class="stat-value" style="font-size: 1.1rem; word-break: break-all;">{{ linkedDraft() }}</span>
          <span class="form-hint">Auto-resets when count updates</span>
        </div>
      </div>

      <!-- Control Flow Grid -->
      <div class="grid-2">
        <!-- Modern @switch & @if Panel -->
        <div class="panel-card">
          <h3 style="margin-top: 0;">Angular Control Flow (@switch & @if)</h3>

          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <button class="btn btn-secondary" (click)="setTab('signals')">Signals Engine</button>
            <button class="btn btn-secondary" (click)="setTab('compiler')">OXC Compiler</button>
            <button class="btn btn-secondary" (click)="setTab('routing')">SPA Router 2.0</button>
          </div>

          @switch (activeTab()) {
            @case ('signals') {
              <div style="padding: 1rem; background: var(--angora-surface-muted); border-radius: 8px;">
                <strong>⚡ Push-Pull Signals:</strong> Glitch-free, batched dependency tracking with O(1) propagation.
              </div>
            }
            @case ('compiler') {
              <div style="padding: 1rem; background: var(--angora-surface-muted); border-radius: 8px;">
                <strong>🦀 OXC Native Parser:</strong> Lightning-fast AST transformations running via native Rust N-API.
              </div>
            }
            @default {
              <div style="padding: 1rem; background: var(--angora-surface-muted); border-radius: 8px;">
                <strong>🧭 Router 2.0:</strong> Client-side route matching, lazy components, and preloading strategies.
              </div>
            }
          }

          <div style="margin-top: 1.5rem;">
            <h4>Count Level Status (@if / @else if / @else):</h4>
            @if (count() >= 10) {
              <div class="badge badge-danger" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
                🔥 Level 3: Master Architect (Count >= 10)
              </div>
            } @else if (count() >= 5) {
              <div class="badge badge-warning" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
                ⚡ Level 2: Power Developer (Count >= 5)
              </div>
            } @else {
              <div class="badge badge-info" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
                🌱 Level 1: Click to increment count to 5 and 10!
              </div>
            }
          </div>
        </div>

        <!-- Deferrable Views & Two-Way Binding -->
        <div class="panel-card">
          <h3 style="margin-top: 0;">Deferrable Views (@defer)</h3>
          <p style="color: var(--angora-text-secondary); font-size: 0.875rem;">
            Loads non-critical views lazily using timer triggers:
          </p>

          @defer (on timer(150ms)) {
            <div style="padding: 1rem; background: var(--angora-success-bg, #ecfdf5); border: 1px solid var(--angora-success); border-radius: 8px; color: var(--angora-success);">
              ✨ <strong>Deferred Component Mounted!</strong> This DOM block deferred initialization until timer fired.
            </div>
          } @placeholder {
            <div style="padding: 1rem; background: var(--angora-surface-muted); border-radius: 8px; color: var(--angora-text-muted);">
              ⏳ Waiting for @defer timer...
            </div>
          }

          <hr style="border: 0; border-top: 1px solid var(--angora-border-color); margin: 1.5rem 0;" />

          <h3 style="margin: 0 0 0.5rem 0;">Two-Way Binding [(value)]</h3>
          <input
            class="input-control"
            [(value)]="quickNote"
            placeholder="Type live synced text..."
          />
          <p style="font-size: 0.875rem; color: var(--angora-text-secondary); margin-top: 0.5rem;">
            Live bound preview: <strong>{{ quickNote() }}</strong>
          </p>

          <div style="margin-top: 1.25rem; padding: 0.75rem; background: var(--angora-surface-muted); border-radius: 6px; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
              <span class="badge badge-success" style="font-size: 0.7rem;">Global Event Delegation</span>
              <span class="badge badge-info" style="font-size: 0.7rem;">Auto Batching</span>
            </div>
            <div style="color: var(--angora-text-secondary);">
              All interactions delegate to root with zero redundant <code>addEventListener</code> calls. Signals are auto-named in DevTools as <code>&lt;DashboardComponent.count&gt;</code>.
            </div>
          </div>
        </div>
      </div>

      <!-- Single-File Component (.angora) Showcase -->
      <counter-sfc></counter-sfc>

      <!-- Keyed Reconciliation List -->
      <div class="panel-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">Keyed Reconciliation (@for ... track ... @empty)</h3>
          <span class="badge badge-info">{{ todos().length }} Active Tasks</span>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <input
            class="input-control"
            [(value)]="newTodoText"
            placeholder="Add new task..."
          />
          <button class="btn btn-primary" (click)="addTodo()">Add</button>
        </div>

        <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;">
          @for (todo of todos(); track todo.id) {
            <app-todo-item [item]="todo" (toggle)="toggleTodo($event)" (remove)="removeTodo($event)"></app-todo-item>
          } @empty {
            <li style="padding: 1rem; text-align: center; color: var(--angora-text-muted);">
              🎉 All items complete! Add a new task above.
            </li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  count = signal(3);
  double = computed(() => this.count() * 2);

  // RxJS toSignal interop
  liveStock = toSignal(liveStream$, { initialValue: 120.45 });

  // linkedSignal: resets computation when source updates
  linkedDraft = linkedSignal({
    source: () => this.count(),
    computation: c => `draft_v${c}_${Date.now().toString().slice(-4)}`,
  });

  // Deep store
  store = signalStore({
    config: {
      mode: 'production',
      features: ['signals', 'router', 'forms', 'ui', 'rxjs'],
    },
  });

  activeTab = signal<'signals' | 'compiler' | 'routing'>('signals');
  quickNote = signal('Fine-grained signals rock!');
  newTodoText = signal('');

  todos = signal<Todo[]>([
    { id: 1, text: 'Ultra-fast Signals & Reactivity', completed: true },
    { id: 2, text: 'Angular Modern Control Flow (@if, @switch, @for)', completed: true },
    { id: 3, text: 'Enterprise SCSS Design System & Theme Engine', completed: true },
    { id: 4, text: 'Accessible UI Suite (<angora-dialog>, Select, Tabs)', completed: true },
    { id: 5, text: 'Enterprise Router 2.0 with Lazy Preloading', completed: true },
    { id: 6, text: 'RxJS Interoperability (toSignal / toObservable)', completed: true },
  ]);

  increment() {
    this.count.update(c => c + 1);
  }

  reset() {
    this.count.set(0);
  }

  setTab(tab: 'signals' | 'compiler' | 'routing') {
    this.activeTab.set(tab);
  }

  addTodo() {
    const text = this.newTodoText().trim();
    if (!text) return;
    this.todos.update(items => [...items, { id: Date.now(), text, completed: false }]);
    this.newTodoText.set('');
  }

  toggleTodo(id: number) {
    this.todos.update(items =>
      items.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }

  removeTodo(id: number) {
    this.todos.update(items => items.filter(t => t.id !== id));
  }
}
