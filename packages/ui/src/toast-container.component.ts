import { Component, inject } from '@angora-js/core';
import { ToastService } from './toast.service.ts';

@Component({
  selector: 'angora-toast-container',
  template: `
    @if (toastService.toasts().length > 0) {
      <div class="angora-toast-container" role="region" aria-live="polite">
        @for (item of toastService.toasts(); track item.id) {
          <div
            class="angora-toast-item"
            [class.angora-toast-item--info]="item.type === 'info'"
            [class.angora-toast-item--success]="item.type === 'success'"
            [class.angora-toast-item--warning]="item.type === 'warning'"
            [class.angora-toast-item--error]="item.type === 'error'"
          >
            <span>{{ item.message }}</span>
            <button
              type="button"
              class="angora-toast-close"
              aria-label="Close"
              (click)="toastService.dismiss(item.id)"
            >
              &times;
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .angora-toast-container {
        position: fixed;
        bottom: var(--angora-spacing-lg, 16px);
        right: var(--angora-spacing-lg, 16px);
        display: flex;
        flex-direction: column;
        gap: var(--angora-spacing-sm, 8px);
        z-index: var(--angora-z-toast, 1080);
        max-width: 380px;
        width: 100%;
        pointer-events: none;
      }
      .angora-toast-item {
        background: var(--angora-surface, #ffffff);
        color: var(--angora-text-primary, #0f172a);
        border: 1px solid var(--angora-border-color, #e2e8f0);
        border-radius: var(--angora-radius-md, 8px);
        box-shadow: var(--angora-elevation-3, 0 10px 15px -3px rgb(0 0 0 / 0.1));
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--angora-spacing-md, 12px) var(--angora-spacing-lg, 16px);
        pointer-events: auto;
        font-size: var(--angora-font-size-sm, 14px);
        line-height: 1.4;
      }
      .angora-toast-item--info {
        border-left: 4px solid var(--angora-info, #06b6d4);
      }
      .angora-toast-item--success {
        border-left: 4px solid var(--angora-success, #10b981);
      }
      .angora-toast-item--warning {
        border-left: 4px solid var(--angora-warning, #f59e0b);
      }
      .angora-toast-item--error {
        border-left: 4px solid var(--angora-danger, #ef4444);
      }
      .angora-toast-close {
        background: transparent;
        border: none;
        padding: 0;
        margin-left: var(--angora-spacing-md, 12px);
        color: var(--angora-text-muted, #94a3b8);
        cursor: pointer;
        font-size: 18px;
      }
    `,
  ],
})
export class AngoraToastContainerComponent {
  toastService = inject(ToastService);
}
