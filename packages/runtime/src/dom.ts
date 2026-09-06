import { effect } from '@angora-js/core';

/**
 * Creates a template cloner function that clones a static HTML string using C++ template element
 */
export function template<T extends Node = HTMLElement>(html: string): () => T {
  let t: HTMLTemplateElement;
  return () => {
    if (!t) {
      t = document.createElement('template');
      t.innerHTML = html;
    }
    const root = t.content.firstElementChild || t.content.firstChild;
    return (root ? root.cloneNode(true) : document.createDocumentFragment()) as T;
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
 * If target is a Comment node (e.g. from template cloning), it replaces it with a Text node.
 */
export function bindText(target: Node, getter: () => any): () => void {
  let node: Node = target;
  if (target && target.nodeType === 8 /* Node.COMMENT_NODE */) {
    const textNode = (target.ownerDocument || document).createTextNode('');
    target.parentNode?.replaceChild(textNode, target);
    node = textNode;
  }
  return effect(() => {
    let val = getter();
    while (typeof val === 'function') {
      val = val();
    }
    node.textContent = val === null || val === undefined ? '' : String(val);
  });
}

/**
 * Binds a signal getter to an element property or attribute
 */
export function bindProp(element: HTMLElement, propName: string, getter: () => any): () => void {
  return effect(() => {
    let value = getter();
    if (typeof value === 'function') {
      value = value();
    }
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
 */
export function bindClass(
  element: HTMLElement,
  className: string,
  getter: () => boolean
): () => void {
  return effect(() => {
    let val = getter();
    if (typeof val === 'function') {
      val = (val as any)();
    }
    element.classList.toggle(className, Boolean(val));
  });
}

/**
 * Binds a dynamic style property to an element: [style.color]="textColor"
 */
export function bindStyle(
  element: HTMLElement,
  styleProp: string,
  getter: () => string
): () => void {
  return effect(() => {
    let val = getter();
    if (typeof val === 'function') {
      val = (val as any)();
    }
    (element.style as any)[styleProp] = val ?? '';
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
    setter(newVal);
  };

  element.addEventListener(eventName, onInput);

  return () => {
    destroyEffect();
    element.removeEventListener(eventName, onInput);
  };
}

/**
 * Binds an event listener to an element
 */
export function bindEvent(
  element: HTMLElement,
  eventName: string,
  handler: (event: Event) => void
): () => void {
  element.addEventListener(eventName, handler);
  return () => {
    element.removeEventListener(eventName, handler);
  };
}
