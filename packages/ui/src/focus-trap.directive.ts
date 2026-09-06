import { Directive, ElementRef, input, effect, inject } from '@angora-js/core';

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Angular-style Directive to trap keyboard focus within an element
 *
 * @example
 * <div angoraFocusTrap [enabled]="isModalOpen()">
 *   ...
 * </div>
 */
@Directive({
  selector: '[angoraFocusTrap]',
  host: {
    '[attr.tabindex]': '-1',
  },
})
export class FocusTrapDirective {
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  enabled = input<boolean>(true);

  constructor() {
    let removeListener: (() => void) | null = null;

    effect(() => {
      const isEnabled = this.enabled();
      const hostEl = this.el?.nativeElement;

      if (!hostEl) return;

      if (isEnabled) {
        removeListener = this.attachTrap(hostEl);
      } else if (removeListener) {
        removeListener();
        removeListener = null;
      }
    });
  }

  private attachTrap(container: HTMLElement): () => void {
    const previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;

    function getFocusableElements(): HTMLElement[] {
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
      );
    }

    const focusables = getFocusableElements();
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown as any);

    return () => {
      container.removeEventListener('keydown', handleKeyDown as any);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }
}
