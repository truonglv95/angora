import { Component, forwardRef, input, output, signal } from '@angora-js/core';

@Component({
  selector: 'angora-menu',
  imports: [forwardRef(() => AngoraMenuItemComponent)],
  template: `
    <div class="angora-menu-container">
      <div
        class="angora-menu-trigger"
        (click)="toggle()"
        aria-haspopup="true"
        [attr.aria-expanded]="open() ? 'true' : 'false'"
      >
        <ng-content select="[menuTrigger]"></ng-content>
      </div>

      @if (open()) {
        <div class="angora-menu-panel" role="menu" (keydown)="handleKeyDown($event)">
          <ng-content></ng-content>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .angora-menu-container {
        position: relative;
        display: inline-block;
      }
      .angora-menu-panel {
        position: absolute;
        top: 100%;
        left: 0;
        min-width: 160px;
        margin-top: 4px;
        padding: 4px 0;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        z-index: 50;
      }
    `,
  ],
})
export class AngoraMenuComponent {
  open = signal(false);

  toggle() {
    this.open.update(v => !v);
  }

  close() {
    this.open.set(false);
  }

  handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.close();
    }
  }
}

@Component({
  selector: 'angora-menu-item',
  template: `
    <div class="angora-menu-item" role="menuitem" tabindex="0" (click)="handleClick($event)">
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      .angora-menu-item {
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        user-select: none;
      }
      .angora-menu-item:hover,
      .angora-menu-item:focus {
        background: #f1f5f9;
        outline: none;
      }
    `,
  ],
})
export class AngoraMenuItemComponent {
  itemClick = output<void>();

  handleClick(e: MouseEvent) {
    this.itemClick.emit();
  }
}
