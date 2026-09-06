import { Component, input, output, effect, signal } from '@angora-js/core';

/**
 * Angular-style Accessible Dialog / Modal Component
 *
 * @example
 * <angora-dialog [(open)]="isDialogOpen">
 *   <h2>Modal Title</h2>
 *   <p>Modal Body Content</p>
 *   <button (click)="isDialogOpen.set(false)">Close</button>
 * </angora-dialog>
 */
@Component({
  selector: 'angora-dialog',
  template: `
    @if (open()) {
      <div class="angora-dialog-backdrop" (click)="handleBackdropClick($event)">
        <div
          class="angora-dialog-panel"
          role="dialog"
          aria-modal="true"
          (keydown)="handleKeyDown($event)"
        >
          <ng-content></ng-content>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .angora-dialog-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .angora-dialog-panel {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        min-width: 320px;
        max-width: 90vw;
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
      }
    `,
  ],
})
export class AngoraDialogComponent {
  open = input<boolean>(false);
  openChange = output<boolean>();
  closeOnEscape = input<boolean>(true);
  closeOnBackdrop = input<boolean>(true);

  show() {
    this.openChange.emit(true);
  }

  close() {
    this.openChange.emit(false);
  }

  toggle() {
    this.openChange.emit(!this.open());
  }

  handleBackdropClick(event: MouseEvent) {
    if (this.closeOnBackdrop() && event.target === event.currentTarget) {
      this.close();
    }
  }

  handleKeyDown(event: KeyboardEvent) {
    if (this.closeOnEscape() && event.key === 'Escape') {
      this.close();
    }
  }
}
