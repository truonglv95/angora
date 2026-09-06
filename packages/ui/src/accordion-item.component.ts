import { Component, input, output, effect } from '@angora-js/core';

/**
 * Angular-style Accordion Item Component (CdkAccordionItem equivalent)
 *
 * @example
 * <angora-accordion-item title="Section 1" [(expanded)]="isSec1Open">
 *   <p>Section 1 Body</p>
 * </angora-accordion-item>
 */
@Component({
  selector: 'angora-accordion-item',
  template: `
    <div class="angora-accordion-item">
      <button
        class="angora-accordion-trigger angora-accordion-header"
        [attr.aria-expanded]="expanded()"
        (click)="toggle()"
      >
        {{ title() }}
      </button>
      @if (expanded()) {
        <div class="angora-accordion-body angora-accordion-content" role="region">
          <ng-content></ng-content>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .angora-accordion-item {
        border-bottom: 1px solid var(--angora-border-color, #e2e8f0);
      }
      .angora-accordion-trigger {
        width: 100%;
        text-align: left;
        padding: var(--angora-spacing-md, 12px) var(--angora-spacing-lg, 16px);
        background: var(--angora-surface, #ffffff);
        color: var(--angora-text-primary, #0f172a);
        border: none;
        font-size: var(--angora-font-size-base, 1rem);
        font-weight: 600;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background-color var(--angora-transition-fast, 0.15s ease);
      }
      .angora-accordion-trigger:hover {
        background: var(--angora-surface-hover, #f1f5f9);
      }
      .angora-accordion-body {
        padding: var(--angora-spacing-md, 12px) var(--angora-spacing-lg, 16px);
        color: var(--angora-text-secondary, #64748b);
        line-height: 1.6;
      }
    `,
  ],
})
export class AngoraAccordionItemComponent {
  title = input<string>('');
  expanded = input<boolean>(false);
  expandedChange = output<boolean>();

  toggle() {
    this.expandedChange.emit(!this.expanded());
  }

  expand() {
    this.expandedChange.emit(true);
  }

  collapse() {
    this.expandedChange.emit(false);
  }
}
