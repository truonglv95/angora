import type { ComponentFixture, DebugElement } from './types.ts';

export function createDebugElement(nativeElement: HTMLElement): DebugElement {
  return {
    nativeElement,
    query(selector: string): HTMLElement | null {
      return nativeElement.querySelector(selector);
    },
    queryAll(selector: string): HTMLElement[] {
      return Array.from(nativeElement.querySelectorAll(selector));
    },
    triggerEventHandler(eventName: string, eventObj?: any): void {
      const evt = eventObj || new Event(eventName, { bubbles: true, cancelable: true });
      nativeElement.dispatchEvent(evt);
    },
  };
}

export function createFixture<T>(
  componentInstance: T,
  container: HTMLElement,
  destroyCallback?: () => void
): ComponentFixture<T> {
  const debugElement = createDebugElement(container);

  return {
    componentInstance,
    nativeElement: container,
    debugElement,
    detectChanges() {
      // In Angora, reactivity is fine-grained and immediate.
      // detectChanges() is maintained for Angular migration compatibility.
    },
    destroy() {
      if (destroyCallback) {
        destroyCallback();
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}
