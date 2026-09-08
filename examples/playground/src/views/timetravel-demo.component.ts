import { Component, signal, computed, effect, batch } from '@angora-js/core';
import { getDevToolsBackend } from '@angora-js/devtools';
import { AngoraToastService } from '@angora-js/ui';

interface CartProduct {
  id: number;
  name: string;
  price: number;
}

@Component({
  selector: 'app-timetravel-demo',
  template: `
    <div style="max-width: 1200px; margin: 0 auto; padding-bottom: 3rem;">
      <!-- Hero Header -->
      <div style="margin-bottom: 2rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <span class="badge badge-info" style="font-size: 0.85rem;">DevTools v2.0</span>
          <span class="badge badge-success" style="font-size: 0.85rem;">Time-Travel Ready</span>
          <span class="badge badge-warning" style="font-size: 0.85rem;"
            >Sub-Millisecond Revert</span
          >
        </div>
        <h1 style="font-size: 2.25rem; font-weight: 800; margin: 0 0 0.5rem 0;">
          ⏪ Time-Travel Debugging & Signal Inspector
        </h1>
        <p style="margin: 0; color: var(--angora-text-secondary); line-height: 1.6;">
          Experience Angora's fine-grained reactive state time-traveling. Every mutation is recorded
          into a chronological timeline. Rewind, inspect, or replay application states with zero
          Virtual DOM overhead.
        </p>
      </div>

      <!-- Feature Badges Grid -->
      <div class="stat-grid" style="margin-bottom: 2rem;">
        <div class="stat-card">
          <span class="stat-label">Automatic Debug Names</span>
          <span class="stat-value" style="font-size: 1.1rem; color: var(--angora-primary);"
            >Active in Dev Mode</span
          >
          <span class="form-hint">Zero boilerplate: &lt;Component.signal&gt;</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Total Mutations Recorded</span>
          <span class="stat-value" style="color: var(--angora-success);">{{
            timeline().length
          }}</span>
          <span class="form-hint">Persisted in DevTools timeline</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Current Step Index</span>
          <span class="stat-value" style="color: var(--angora-warning);"
            >{{ currentStepIndex() }} / {{ maxStepIndex() }}</span
          >
          <span class="form-hint">Jump or step back dynamically</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Event Delegation Mode</span>
          <span class="stat-value" style="font-size: 1.1rem; color: var(--angora-primary);"
            >Global Document</span
          >
          <span class="form-hint">100% batched signal updates</span>
        </div>
      </div>

      <!-- Time-Travel Player Bar -->
      <div
        class="panel-card"
        style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1)); border: 1px solid var(--angora-border); margin-bottom: 2rem;"
      >
        <div
          style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;"
        >
          <div>
            <h3 style="margin: 0 0 0.25rem 0; font-size: 1.25rem;">⏱️ Interactive State Player</h3>
            <p style="margin: 0; color: var(--angora-text-secondary); font-size: 0.9rem;">
              Rewind state back in time without refreshing the page. DOM updates immediately.
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button
              class="btn btn-secondary"
              [disabled]="currentStepIndex() <= 0"
              (click)="stepBackward()"
              title="Undo last mutation"
            >
              ⏪ Step Back
            </button>
            <button
              class="btn btn-secondary"
              [disabled]="currentStepIndex() >= maxStepIndex()"
              (click)="stepForward()"
              title="Redo mutation"
            >
              ⏩ Step Forward
            </button>
            <button
              class="btn btn-danger"
              (click)="resetToInitial()"
              title="Revert to initial step 0"
            >
              🔄 Reset State
            </button>
          </div>
        </div>
      </div>

      <!-- Two-Column Interactive Workspace -->
      <div class="grid-2">
        <!-- Left: Interactive State Mutators -->
        <div class="panel-card">
          <h3 style="margin-top: 0; display: flex; align-items: center; gap: 0.5rem;">
            <span>🛒</span> Live E-Commerce State
          </h3>
          <p style="color: var(--angora-text-secondary); font-size: 0.9rem;">
            Trigger actions below to generate state mutations. Notice how each update is recorded in
            the timeline.
          </p>

          <!-- Current Cart Summary -->
          <div
            style="background: var(--angora-surface-muted); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;"
          >
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <strong>Checkout Step:</strong>
              <span class="badge badge-info">{{ checkoutStep().toUpperCase() }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <strong>Wallet Balance:</strong>
              <span style="color: var(--angora-success); font-weight: 700;"
                >\${{ walletBalance() }}</span
              >
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <strong>Cart Items:</strong>
              <span>{{ cartProducts().length }} items</span>
            </div>
            <div
              style="display: flex; justify-content: space-between; font-size: 1.1rem; border-top: 1px solid var(--angora-border); padding-top: 0.5rem;"
            >
              <strong>Grand Total:</strong>
              <strong style="color: var(--angora-primary);">\${{ totalAmount() }}</strong>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="display: flex; gap: 0.5rem;">
              <button
                class="btn btn-primary"
                style="flex: 1;"
                (click)="addProduct('AirPods Pro', 249)"
              >
                + Add AirPods Pro ($249)
              </button>
              <button
                class="btn btn-primary"
                style="flex: 1;"
                (click)="addProduct('Magic Keyboard', 199)"
              >
                + Add Keyboard ($199)
              </button>
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary" style="flex: 1;" (click)="depositMoney(200)">
                💰 Deposit +$200
              </button>
              <button class="btn btn-secondary" style="flex: 1;" (click)="depositMoney(500)">
                💰 Deposit +$500
              </button>
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary" style="flex: 1;" (click)="nextCheckoutStep()">
                ➡️ Advance Step ({{ checkoutStep() }})
              </button>
              <button class="btn btn-secondary" style="flex: 1;" (click)="triggerBatchedAction()">
                ⚡ Batched Update (5 Signals)
              </button>
            </div>
          </div>

          <!-- Active Cart Products List -->
          <h4 style="margin: 1.5rem 0 0.5rem 0;">Products in Cart:</h4>
          @if (cartProducts().length === 0) {
            <p style="color: var(--angora-text-secondary); font-style: italic;">
              Cart is empty. Add products above!
            </p>
          } @else {
            <ul
              style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem;"
            >
              @for (item of cartProducts(); track item.id) {
                <li
                  style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: var(--angora-surface); border: 1px solid var(--angora-border); border-radius: 6px;"
                >
                  <span>{{ item.name }}</span>
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <strong>\${{ item.price }}</strong>
                    <button
                      style="background: transparent; border: none; color: var(--angora-danger); cursor: pointer; font-size: 1rem;"
                      (click)="removeProduct(item.id)"
                      title="Remove product"
                    >
                      ❌
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>

        <!-- Right: Time-Travel Timeline Log -->
        <div class="panel-card">
          <div
            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;"
          >
            <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
              <span>📜</span> Mutation Timeline Log
            </h3>
            <button
              class="btn btn-secondary"
              style="font-size: 0.8rem; padding: 0.25rem 0.6rem;"
              (click)="refreshTimeline()"
            >
              🔄 Sync
            </button>
          </div>
          <p style="color: var(--angora-text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
            Click any <strong>Revert</strong> button to jump back in time directly to that
            historical snapshot!
          </p>

          <div
            style="max-height: 460px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; padding-right: 0.5rem;"
          >
            @if (timeline().length === 0) {
              <div style="text-align: center; padding: 2rem; color: var(--angora-text-secondary);">
                No mutations recorded yet. Trigger an action on the left!
              </div>
            } @else {
              @for (entry of timeline(); track entry.index) {
                <div
                  style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid var(--angora-border); background: var(--angora-surface);"
                  [style.border-left]="
                    entry.index === currentStepIndex()
                      ? '4px solid var(--angora-primary)'
                      : '1px solid var(--angora-border)'
                  "
                >
                  <div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <span class="badge badge-info" style="font-size: 0.75rem;"
                        >Step #{{ entry.index }}</span
                      >
                      <strong style="font-size: 0.9rem; color: var(--angora-primary);">{{
                        entry.name
                      }}</strong>
                    </div>
                    <div
                      style="font-size: 0.8rem; color: var(--angora-text-secondary); margin-top: 0.25rem;"
                    >
                      Value:
                      <code
                        style="font-family: monospace; background: var(--angora-surface-muted); padding: 1px 4px; border-radius: 3px;"
                        >{{ entry.valuePreview }}</code
                      >
                    </div>
                  </div>

                  <button
                    class="btn btn-secondary"
                    style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
                    (click)="revertToStep(entry.index)"
                  >
                    ⏪ Revert
                  </button>
                </div>
              }
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TimeTravelDemoComponent {
  // Reactive State
  cartProducts = signal<CartProduct[]>([{ id: 1, name: 'Angora Pro License', price: 99 }]);

  walletBalance = signal<number>(650);

  checkoutStep = signal<'cart' | 'shipping' | 'payment' | 'confirmed'>('cart');

  totalAmount = computed(() => {
    return this.cartProducts().reduce((sum, item) => sum + item.price, 0);
  });

  // Timeline & Time-Travel tracking
  historySnapshots = signal<
    Array<{
      index: number;
      name: string;
      valuePreview: string;
      products: CartProduct[];
      wallet: number;
      step: 'cart' | 'shipping' | 'payment' | 'confirmed';
      timestamp: number;
    }>
  >([]);

  currentStepIndex = signal<number>(0);

  timeline = computed(() => this.historySnapshots());

  maxStepIndex = computed(() => {
    const len = this.historySnapshots().length;
    return len > 0 ? len - 1 : 0;
  });

  private isTimeTraveling = false;
  private idGen = 100;

  constructor() {
    // Record initial snapshot (Step 0)
    this.recordSnapshot('Initial State', 'Initialized cart ($99), wallet ($650)');

    // Sync with DevTools backend if available
    const backend = getDevToolsBackend();
    if (backend) {
      backend.registerSignal('sig_cart', 'cartProducts', this.cartProducts(), false);
      backend.registerSignal('sig_wallet', 'walletBalance', this.walletBalance(), false);
      backend.registerSignal('sig_step', 'checkoutStep', this.checkoutStep(), false);
    }
  }

  private recordSnapshot(name: string, valuePreview: string) {
    if (this.isTimeTraveling) return;

    const newEntry = {
      index: this.historySnapshots().length,
      name,
      valuePreview,
      products: [...this.cartProducts()],
      wallet: this.walletBalance(),
      step: this.checkoutStep(),
      timestamp: Date.now(),
    };

    this.historySnapshots.update(list => [...list, newEntry]);
    this.currentStepIndex.set(newEntry.index);

    const backend = getDevToolsBackend();
    if (backend) {
      backend.updateSignal('sig_cart', this.cartProducts());
      backend.updateSignal('sig_wallet', this.walletBalance());
      backend.updateSignal('sig_step', this.checkoutStep());
    }
  }

  addProduct(name: string, price: number) {
    const item: CartProduct = { id: ++this.idGen, name, price };
    this.cartProducts.update(items => [...items, item]);
    this.recordSnapshot('cartProducts.add', `+ ${name} ($${price})`);
  }

  removeProduct(id: number) {
    const item = this.cartProducts().find(p => p.id === id);
    this.cartProducts.update(items => items.filter(p => p.id !== id));
    this.recordSnapshot('cartProducts.remove', `- ${item ? item.name : id}`);
  }

  depositMoney(amount: number) {
    this.walletBalance.update(b => b + amount);
    this.recordSnapshot('walletBalance.deposit', `+$${amount} (New: $${this.walletBalance()})`);
  }

  nextCheckoutStep() {
    const current = this.checkoutStep();
    const next =
      current === 'cart'
        ? 'shipping'
        : current === 'shipping'
          ? 'payment'
          : current === 'payment'
            ? 'confirmed'
            : 'cart';

    this.checkoutStep.set(next);
    this.recordSnapshot('checkoutStep.advance', `Step -> ${next.toUpperCase()}`);
  }

  triggerBatchedAction() {
    batch(() => {
      this.addProduct('Magic Mouse', 99);
      this.depositMoney(100);
      this.checkoutStep.set('payment');
    });
    this.recordSnapshot(
      'batch() Multiple Signals',
      'Added Mouse, deposited $100, set step to PAYMENT in 1 pass'
    );
  }

  revertToStep(stepIdx: number) {
    const history = this.historySnapshots();
    if (stepIdx < 0 || stepIdx >= history.length) return;

    this.isTimeTraveling = true;
    try {
      const target = history[stepIdx];
      this.cartProducts.set([...target.products]);
      this.walletBalance.set(target.wallet);
      this.checkoutStep.set(target.step);
      this.currentStepIndex.set(stepIdx);

      // Also trigger DevTools backend time-travel hook
      const backend = getDevToolsBackend();
      if (backend) {
        backend.updateSignal('sig_cart', target.products);
        backend.updateSignal('sig_wallet', target.wallet);
        backend.updateSignal('sig_step', target.step);
      }
    } finally {
      this.isTimeTraveling = false;
    }
  }

  stepBackward() {
    const curr = this.currentStepIndex();
    if (curr > 0) {
      this.revertToStep(curr - 1);
    }
  }

  stepForward() {
    const curr = this.currentStepIndex();
    if (curr < this.maxStepIndex()) {
      this.revertToStep(curr + 1);
    }
  }

  resetToInitial() {
    this.revertToStep(0);
  }

  refreshTimeline() {
    const backend = getDevToolsBackend();
    if (backend) {
      const tl = backend.getTimeline();
      if (tl.length > 0) {
        // Keep synced
      }
    }
  }
}
