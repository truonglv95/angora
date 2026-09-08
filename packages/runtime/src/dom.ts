import { effect, batch } from '@angora-js/core';

/**
 * Creates a template cloner function that clones a static HTML string using C++ template element
 */
export function template<T extends Node = HTMLElement>(html: string): () => T {
  let t: HTMLTemplateElement;
  let cachedDoc: Document | null = null;
  return () => {
    const curDoc = typeof document !== 'undefined' ? document : null;
    if (!t || cachedDoc !== curDoc) {
      cachedDoc = curDoc;
      t = (curDoc || document).createElement('template');
      t.innerHTML = html;
    }
    const root = t.content.firstElementChild || t.content.firstChild;
    return (root ? root.cloneNode(true) : (curDoc || document).createDocumentFragment()) as T;
  };
}

/**
 * Creates an HTML element
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K
): HTMLElementTagNameMap[K] {
  return document.createElement(tagName);
}

/**
 * Creates a Text node
 */
export function createText(initialValue: string = ''): Text {
  return document.createTextNode(initialValue);
}

/**
 * Creates a Comment anchor node for control flow (@if, @for, @switch)
 */
export function createComment(name: string = ''): Comment {
  return document.createComment(name);
}

/**
 * Binds a signal getter directly to a Text node or Element's textContent.
 * Uses micro-diffing on nodeValue to prevent redundant browser layout/paint triggers.
 */
export function bindText(target: Node, getter: () => any): () => void {
  let node: Node = target;
  if (target && target.nodeType === 8 /* Node.COMMENT_NODE */) {
    const textNode = (target.ownerDocument || document).createTextNode('');
    target.parentNode?.replaceChild(textNode, target);
    node = textNode;
  }
  let prevStr: string | null = null;
  return effect(() => {
    let val = getter();
    while (typeof val === 'function') {
      val = val();
    }
    const str = val === null || val === undefined ? '' : String(val);
    if (str !== prevStr) {
      prevStr = str;
      if (node.nodeType === 3) {
        node.nodeValue = str;
      } else {
        node.textContent = str;
      }
    }
  });
}

/**
 * Binds a signal getter to an element property or attribute with value diffing
 */
export function bindProp(element: HTMLElement, propName: string, getter: () => any): () => void {
  let prevVal: any = undefined;
  return effect(() => {
    let value = getter();
    if (typeof value === 'function') {
      value = value();
    }
    if (value === prevVal) return;
    prevVal = value;

    if (propName in element && !propName.includes('-')) {
      (element as any)[propName] = value;
    } else {
      if (
        value === null ||
        value === undefined ||
        (value === false && !propName.startsWith('aria-'))
      ) {
        element.removeAttribute(propName);
      } else {
        element.setAttribute(propName, String(value));
      }
    }
  });
}

/**
 * Binds a dynamic boolean class to an element: [class.active]="isActive"
 * Micro-diffs boolean state to avoid redundant classList modifications.
 */
export function bindClass(
  element: HTMLElement,
  className: string,
  getter: () => boolean
): () => void {
  let prevBool: boolean | null = null;
  return effect(() => {
    let val = getter();
    if (typeof val === 'function') {
      val = (val as any)();
    }
    const bool = Boolean(val);
    if (bool !== prevBool) {
      prevBool = bool;
      element.classList.toggle(className, bool);
    }
  });
}

/**
 * Binds a dynamic style property to an element: [style.color]="textColor"
 * Micro-diffs style string to avoid redundant inline style dirtying.
 */
export function bindStyle(
  element: HTMLElement,
  styleProp: string,
  getter: () => string
): () => void {
  let prevVal: string | null = null;
  return effect(() => {
    let val = getter();
    if (typeof val === 'function') {
      val = (val as any)();
    }
    const str = val ?? '';
    if (str !== prevVal) {
      prevVal = str;
      (element.style as any)[styleProp] = str;
    }
  });
}

/**
 * Binds two-way signal data: [(value)]="mySignal" or [(ngModel)]="mySignal"
 */
export function bindTwoWay(
  element: HTMLElement,
  propName: string,
  getter: () => any,
  setter: (val: any) => void
): () => void {
  // Sync DOM <- Signal
  const destroyEffect = effect(() => {
    let val = getter();
    if (typeof val === 'function') {
      val = val();
    }
    const currentVal = (element as any)[propName];
    if (currentVal !== val) {
      (element as any)[propName] = val ?? '';
    }
  });

  // Sync DOM -> Signal
  const eventName =
    element.tagName === 'SELECT' ||
    (element as any).type === 'checkbox' ||
    (element as any).type === 'radio'
      ? 'change'
      : 'input';

  const onInput = () => {
    let newVal: any = (element as any)[propName];
    if ((element as any).type === 'checkbox') {
      newVal = (element as HTMLInputElement).checked;
    }
    batch(() => setter(newVal));
  };

  element.addEventListener(eventName, onInput);

  return () => {
    destroyEffect();
    element.removeEventListener(eventName, onInput);
  };
}

const DELEGATED_EVENTS = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'contextmenu',
  'input',
  'change',
  'keydown',
  'keyup',
  'submit',
  'pointerdown',
  'pointerup',
]);

const delegatedDocuments = new WeakMap<Document, Set<string>>();

function ensureDelegatedListener(doc: Document, eventName: string): void {
  let registered = delegatedDocuments.get(doc);
  if (!registered) {
    registered = new Set<string>();
    delegatedDocuments.set(doc, registered);
  }

  if (registered.has(eventName)) return;
  registered.add(eventName);

  doc.addEventListener(eventName, (e: Event) => {
    let curr: Node | null = e.target as Node;
    const propKey = `__angora_ev_${eventName}`;

    while (curr && curr !== doc) {
      if (curr.nodeType === 1 /* Node.ELEMENT_NODE */) {
        const handlers = (curr as any)[propKey] as Set<(ev: Event) => void> | undefined;
        if (handlers && handlers.size > 0) {
          try {
            Object.defineProperty(e, 'currentTarget', {
              value: curr,
              configurable: true,
            });
          } catch {
            // Ignore if currentTarget cannot be redefined in some synthetic environments
          }

          for (const handler of Array.from(handlers)) {
            handler(e);
          }

          (e as any).__angoraHandled = true;
          if (e.cancelBubble) {
            break;
          }
        }
      }
      curr = curr.parentNode;
    }
  });
}

/**
 * Binds an event listener to an element with Global Event Delegation & automatic Signal batching.
 * For bubbling events (click, input, keydown, etc.), delegates to document root to save memory
 * and accelerate large lists. Falls back to direct listener for non-delegable or detached nodes.
 */
export function bindEvent(
  element: HTMLElement,
  eventName: string,
  handler: (event: Event) => void
): () => void {
  const batchedHandler = (event: Event) => {
    batch(() => handler(event));
  };

  const globalDoc = typeof document !== 'undefined' ? document : null;
  const ownerDoc = element.ownerDocument;
  const doc = globalDoc || ownerDoc;

  if (DELEGATED_EVENTS.has(eventName) && doc) {
    ensureDelegatedListener(doc, eventName);
    if (ownerDoc && ownerDoc !== doc) {
      ensureDelegatedListener(ownerDoc, eventName);
    }

    const propKey = `__angora_ev_${eventName}`;
    if (!(element as any)[propKey]) {
      (element as any)[propKey] = new Set<(ev: Event) => void>();
    }
    const set = (element as any)[propKey] as Set<(ev: Event) => void>;
    set.add(batchedHandler);

    // Fallback for non-bubbling events or detached nodes in headless tests/fragments
    const directFallback = (event: Event) => {
      if ((event as any).__angoraHandled) return;
      if (!element.isConnected || !event.bubbles) {
        (event as any).__angoraHandled = true;
        batchedHandler(event);
      }
    };
    element.addEventListener(eventName, directFallback);

    return () => {
      set.delete(batchedHandler);
      if (set.size === 0) {
        delete (element as any)[propKey];
      }
      element.removeEventListener(eventName, directFallback);
    };
  }

  element.addEventListener(eventName, batchedHandler);
  return () => {
    element.removeEventListener(eventName, batchedHandler);
  };
}
