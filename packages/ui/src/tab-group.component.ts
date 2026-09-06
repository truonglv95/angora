import { Component, input, output, signal, effect } from '@angora-js/core';

/**
 * Angular-style Accessible Tab Group Component (MatTabGroup equivalent)
 *
 * @example
 * <angora-tab-group [(selectedIndex)]="activeTab">
 *   <angora-tab label="Account">...</angora-tab>
 *   <angora-tab label="Security">...</angora-tab>
 * </angora-tab-group>
 */
@Component({
  selector: 'angora-tab-group',
  template: `
    <div class="angora-tab-group">
      <div class="angora-tab-header" role="tablist" (keydown)="handleKeyDown($event)">
        @for (label of labels(); track $index) {
          <button
            class="angora-tab-btn"
            role="tab"
            [class.active]="selectedIndex() === $index"
            [attr.aria-selected]="selectedIndex() === $index"
            (click)="selectTab($index)"
          >
            {{ label }}
          </button>
        }
      </div>
      <div class="angora-tab-body">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      .angora-tab-group {
        display: flex;
        flex-direction: column;
        width: 100%;
      }
      .angora-tab-header {
        display: flex;
        border-bottom: 2px solid #e2e8f0;
        gap: 0.5rem;
      }
      .angora-tab-btn {
        padding: 0.75rem 1.25rem;
        border: none;
        background: transparent;
        cursor: pointer;
        font-weight: 500;
        color: #64748b;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
      }
      .angora-tab-btn.active {
        color: #3b82f6;
        border-bottom-color: #3b82f6;
      }
    `,
  ],
})
export class AngoraTabGroupComponent {
  selectedIndex = input<number>(0);
  selectedIndexChange = output<number>();
  labels = signal<string[]>([]);

  selectTab(index: number) {
    if (index !== this.selectedIndex()) {
      this.selectedIndexChange.emit(index);
    }
  }

  setLabels(items: string[]) {
    this.labels.set(items);
  }

  handleKeyDown(event: KeyboardEvent) {
    const total = this.labels().length;
    if (total === 0) return;

    const current = this.selectedIndex();
    let next = current;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (current + 1) % total;
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (current - 1 + total) % total;
      event.preventDefault();
    } else if (event.key === 'Home') {
      next = 0;
      event.preventDefault();
    } else if (event.key === 'End') {
      next = total - 1;
      event.preventDefault();
    }

    if (next !== current) {
      this.selectTab(next);
    }
  }
}
