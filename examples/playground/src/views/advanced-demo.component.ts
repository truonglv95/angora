import { Component, signal, computed, inject } from '@angora-js/core';
import { createQuery, createMutation, QueryClient } from '@angora-js/query';
import { createVirtualizer, usePopover, useCombobox } from '@angora-js/primitives';
import { AngoraToastService } from '@angora-js/ui';

interface MarketItem {
  id: number;
  symbol: string;
  name: string;
  price: number;
  change: string;
}

const INITIAL_MARKET_DATA: Record<string, MarketItem[]> = {
  tech: [
    { id: 1, symbol: 'NVDA', name: 'Nvidia Corp', price: 128.5, change: '+4.2%' },
    { id: 2, symbol: 'AAPL', name: 'Apple Inc', price: 232.1, change: '+1.5%' },
    { id: 3, symbol: 'GOOGL', name: 'Alphabet Inc', price: 178.4, change: '+2.8%' },
    { id: 4, symbol: 'MSFT', name: 'Microsoft Corp', price: 448.9, change: '+0.9%' },
  ],
  crypto: [
    { id: 10, symbol: 'BTC', name: 'Bitcoin', price: 68420.0, change: '+3.1%' },
    { id: 11, symbol: 'ETH', name: 'Ethereum', price: 3540.0, change: '+2.4%' },
    { id: 12, symbol: 'SOL', name: 'Solana', price: 154.2, change: '+6.8%' },
  ],
  ai: [
    { id: 20, symbol: 'OPENAI', name: 'OpenAI Ecosystem', price: 340.0, change: '+8.5%' },
    { id: 21, symbol: 'ANTH', name: 'Anthropic Compute', price: 210.5, change: '+5.2%' },
  ],
};

@Component({
  selector: 'app-advanced-demo',
  template: `
    <div style="max-width: 1200px; margin: 0 auto; padding-bottom: 3rem;">
      <!-- Hero Header -->
      <div style="margin-bottom: 2rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <span class="badge badge-warning" style="font-size: 0.85rem;">Phase 1–6 Integration</span>
          <span class="badge badge-success" style="font-size: 0.85rem;">Zero-VDOM 60 FPS</span>
        </div>
        <h1 style="font-size: 2.25rem; font-weight: 800; margin: 0 0 0.5rem 0;">
          🚀 Advanced Enterprise Architecture & Virtualization
        </h1>
        <p style="margin: 0; color: var(--angora-text-secondary); line-height: 1.6;">
          Demonstrating <strong>@angora-js/query</strong> (Signals-powered SWR, Optimistic
          Mutations, Zero-Waterfall SSR), <strong>@angora-js/primitives</strong> (O(1) Virtual
          Scrolling for 50,000 items, Headless Combobox & Popover), and
          <strong>Click-to-Source Inspector</strong>.
        </p>
      </div>

      <!-- Click-to-Source Inspector Banner -->
      <div
        style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12)); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 2rem; display: flex; align-items: center; justify-content: space-between;"
      >
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">🐾</span>
          <div>
            <strong style="color: var(--angora-primary);">Click-to-Source Inspector Active:</strong>
            <span style="color: var(--angora-text-secondary); margin-left: 0.5rem;">
              Hold
              <kbd
                style="background: rgba(0,0,0,0.15); padding: 2px 6px; border-radius: 4px; font-family: monospace;"
                >Option</kbd
              >
              (Mac) or
              <kbd
                style="background: rgba(0,0,0,0.15); padding: 2px 6px; border-radius: 4px; font-family: monospace;"
                >Alt</kbd
              >
              (Windows) and click any component to open its TypeScript file in your IDE!
            </span>
          </div>
        </div>
        <span class="badge badge-info">DX 10/10</span>
      </div>

      <!-- Two-Column Grid: Query & Virtual Scroll -->
      <div class="grid-2">
        <!-- Section 1: @angora-js/query SWR & Optimistic Mutations -->
        <div class="panel-card">
          <div
            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;"
          >
            <h3 style="margin: 0;">⚡ @angora-js/query (SWR & Cache)</h3>
            <span
              class="badge"
              [class.badge-success]="!marketQuery.isFetching()"
              [class.badge-warning]="marketQuery.isFetching()"
            >
              @if (marketQuery.isFetching()) {
                <span>Fetching in background...</span>
              } @else {
                <span>Cache Fresh</span>
              }
            </span>
          </div>

          <!-- Category Filter Tabs -->
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <button
              class="btn"
              [class.btn-primary]="selectedCategory() === 'tech'"
              [class.btn-secondary]="selectedCategory() !== 'tech'"
              (click)="setCategory('tech')"
            >
              💻 Tech Stocks
            </button>
            <button
              class="btn"
              [class.btn-primary]="selectedCategory() === 'crypto'"
              [class.btn-secondary]="selectedCategory() !== 'crypto'"
              (click)="setCategory('crypto')"
            >
              🪙 Crypto Assets
            </button>
            <button
              class="btn"
              [class.btn-primary]="selectedCategory() === 'ai'"
              [class.btn-secondary]="selectedCategory() !== 'ai'"
              (click)="setCategory('ai')"
            >
              🤖 AI Compute
            </button>
          </div>

          <!-- Market Query Table -->
          <div
            style="border: 1px solid var(--angora-border-color); border-radius: 6px; overflow: hidden; margin-bottom: 1rem;"
          >
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead
                style="background: var(--angora-bg-secondary); border-bottom: 1px solid var(--angora-border-color);"
              >
                <tr>
                  <th style="padding: 0.75rem 1rem;">Ticker</th>
                  <th style="padding: 0.75rem 1rem;">Name</th>
                  <th style="padding: 0.75rem 1rem;">Price</th>
                  <th style="padding: 0.75rem 1rem; text-align: right;">Change</th>
                </tr>
              </thead>
              <tbody>
                @if (marketQuery.isLoading() && !marketQuery.data()) {
                  <tr>
                    <td
                      colspan="4"
                      style="padding: 2rem; text-align: center; color: var(--angora-text-muted);"
                    >
                      Loading market signals...
                    </td>
                  </tr>
                } @else {
                  @for (item of marketQuery.data() || []; track item.id) {
                    <tr style="border-bottom: 1px solid var(--angora-border-color);">
                      <td
                        style="padding: 0.75rem 1rem; font-weight: bold; color: var(--angora-primary);"
                      >
                        {{ item.symbol }}
                      </td>
                      <td style="padding: 0.75rem 1rem;">{{ item.name }}</td>
                      <td style="padding: 0.75rem 1rem;">\${{ item.price.toFixed(2) }}</td>
                      <td
                        style="padding: 0.75rem 1rem; text-align: right; color: var(--angora-success); font-weight: 600;"
                      >
                        {{ item.change }}
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>

          <!-- Mutation Actions -->
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button
              class="btn btn-primary"
              [disabled]="addStockMutation.isLoading()"
              (click)="addOptimisticStock()"
            >
              + Optimistic Add Asset
            </button>
            <button
              class="btn btn-secondary"
              style="border-color: var(--angora-danger); color: var(--angora-danger);"
              [disabled]="addStockMutation.isLoading()"
              (click)="simulateFailedMutation()"
            >
              Simulate Server 500 Rollback
            </button>
            <button class="btn btn-secondary" (click)="refetchQuery()">
              🔄 Invalidate & SWR Refetch
            </button>
          </div>
        </div>

        <!-- Section 2: @angora-js/primitives O(1) Virtual Scroll 50,000 Rows -->
        <div class="panel-card">
          <div
            style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;"
          >
            <h3 style="margin: 0;">📜 50,000 Rows Virtualizer</h3>
            <span class="badge badge-info">
              DOM: {{ virtualizer.virtualItems().length }} nodes of 50,000
            </span>
          </div>

          <p style="font-size: 0.85rem; color: var(--angora-text-secondary); margin-bottom: 1rem;">
            Zero-VDOM template cloning with $O(1)$ calculation. Only items inside the visible window
            plus overscan are mounted in the DOM.
          </p>

          <!-- Quick Jump Buttons -->
          <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
            <button
              class="btn btn-secondary"
              style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
              (click)="jumpTo(0)"
            >
              Top (Row 0)
            </button>
            <button
              class="btn btn-secondary"
              style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
              (click)="jumpTo(10000)"
            >
              Row 10,000
            </button>
            <button
              class="btn btn-secondary"
              style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
              (click)="jumpTo(25000)"
            >
              Row 25,000
            </button>
            <button
              class="btn btn-secondary"
              style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
              (click)="jumpTo(49990)"
            >
              Bottom (Row 50k)
            </button>
          </div>

          <!-- Virtual Scroll Container -->
          <div
            id="virtual-scroll-viewport"
            style="height: 320px; overflow-y: auto; border: 1px solid var(--angora-border-color); border-radius: 6px; position: relative; background: var(--angora-bg-secondary);"
            (scroll)="onViewportScroll($event)"
          >
            <!-- Virtual Canvas Spacer -->
            <div
              [style.height.px]="virtualizer.totalSize()"
              style="position: relative; width: 100%;"
            >
              @for (item of virtualizer.virtualItems(); track item.index) {
                <div
                  style="position: absolute; left: 0; width: 100%; height: 40px; border-bottom: 1px solid var(--angora-border-color); display: flex; align-items: center; justify-content: space-between; padding: 0 1rem; box-sizing: border-box; background: var(--angora-bg-surface);"
                  [style.top.px]="item.start"
                >
                  <span style="font-family: monospace; color: var(--angora-text-muted);"
                    >#{{ item.index + 1 }}</span
                  >
                  <strong style="color: var(--angora-primary);"
                    >Telemetry Node {{ (item.index * 137) % 9999 }}</strong
                  >
                  <span class="badge badge-info" style="font-size: 0.7rem;"
                    >Latency {{ (item.index % 12) + 1 }}ms</span
                  >
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdvancedDemoComponent {
  toast = inject(AngoraToastService);

  // 1. Query State
  selectedCategory = signal<'tech' | 'crypto' | 'ai'>('tech');

  marketQuery = createQuery(() => ({
    queryKey: ['market-data', this.selectedCategory()],
    queryFn: async () => {
      // Simulate real-world network latency (300ms)
      await new Promise(r => setTimeout(r, 300));
      return [...INITIAL_MARKET_DATA[this.selectedCategory()]];
    },
    staleTime: 10000, // 10s fresh cache
  }));

  setCategory(cat: 'tech' | 'crypto' | 'ai') {
    this.selectedCategory.set(cat);
  }

  refetchQuery() {
    this.marketQuery.refetch();
    this.toast.info('SWR Refetch: Reading from cache while fetching latest updates in background.');
  }

  // 2. Optimistic Mutation
  addStockMutation = createMutation({
    mutationFn: async (newAsset: MarketItem) => {
      await new Promise(r => setTimeout(r, 600));
      return newAsset;
    },
    onMutate: async newAsset => {
      // Optimistic update
      const current = this.marketQuery.data() || [];
      INITIAL_MARKET_DATA[this.selectedCategory()].push(newAsset);
      this.marketQuery.data.set([...current, newAsset]);
      this.toast.success(`Optimistic Update Applied: Added ${newAsset.symbol} instantly to UI!`);
      return { previous: current };
    },
    onError: (err, newAsset, context) => {
      // Rollback
      if (context?.previous) {
        this.marketQuery.data.set(context.previous);
        INITIAL_MARKET_DATA[this.selectedCategory()].pop();
      }
      this.toast.error(
        'Mutation Failed: Server returned 500 error. Reverted optimistic state cleanly!'
      );
    },
  });

  addOptimisticStock() {
    const id = Date.now();
    const symbol = `SYM${Math.floor(Math.random() * 900) + 100}`;
    this.addStockMutation.mutate({
      id,
      symbol,
      name: 'Dynamic Venture Capital',
      price: Math.floor(Math.random() * 500) + 50,
      change: '+12.4%',
    });
  }

  simulateFailedMutation() {
    const failedMutation = createMutation({
      mutationFn: async () => {
        await new Promise(r => setTimeout(r, 400));
        throw new Error('Database transaction timeout');
      },
      onMutate: async (newAsset: MarketItem) => {
        const current = this.marketQuery.data() || [];
        this.marketQuery.data.set([...current, newAsset]);
        this.toast.warning('Optimistic UI Applied: Pending server confirmation...');
        return { previous: current };
      },
      onError: (err, newAsset, context) => {
        if (context?.previous) {
          this.marketQuery.data.set(context.previous);
        }
        this.toast.error(
          'Server Rejected Transaction: Optimistic state rolled back to previous snapshot!'
        );
      },
    });

    failedMutation.mutate({
      id: 9999,
      symbol: 'FAIL',
      name: 'Faulty Asset Corp',
      price: 0,
      change: '-99%',
    });
  }

  // 3. Virtual Scrolling Engine (50,000 items)
  virtualizer = createVirtualizer({
    count: () => 50_000,
    itemHeight: 40,
    viewportHeight: () => 320,
    overscan: 4,
  });

  onViewportScroll(event: any) {
    const top = event.target?.scrollTop ?? 0;
    this.virtualizer.setScrollOffset(top);
  }

  jumpTo(index: number) {
    this.virtualizer.scrollToIndex(index);
    const viewport = document.getElementById('virtual-scroll-viewport');
    if (viewport) {
      viewport.scrollTop = index * 40;
    }
    this.toast.info(`Jumped to Row #${index} (offset ${index * 40}px)`);
  }
}
