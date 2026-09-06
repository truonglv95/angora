import {
  Injector,
  rootInjector,
  DIRECTIVE_DEF,
  COMPONENT_DEF,
  ElementRef,
  effect,
  getDirectiveDef,
  type DirectiveDef,
} from '@angora-js/core';
import { bindProp, bindClass, bindStyle, bindEvent } from './dom.ts';

/**
 * Attaches a directive instance to a DOM element, binding its host properties and events
 */
export function applyDirective<T = any>(
  directiveType: new (...args: any[]) => T,
  element: HTMLElement,
  parentInjector: Injector = rootInjector
): T {
  const def = getDirectiveDef<T>(directiveType);

  // Create injector with ElementRef available
  const elRef = new ElementRef(element);
  const directiveInjector = new Injector(
    [
      {
        provide: directiveType,
        useFactory: () => {
          try {
            return new directiveType(elRef);
          } catch {
            return new (directiveType as any)();
          }
        },
      },
      { provide: ElementRef, useValue: elRef },
      ...(def?.metadata?.providers || []),
    ],
    parentInjector
  );

  const instance = directiveInjector.get(directiveType);

  // Bind host properties and event listeners from metadata.host
  if (def?.metadata?.host) {
    for (const [bindingKey, expr] of Object.entries(def.metadata.host)) {
      if (bindingKey.startsWith('[') && bindingKey.endsWith(']')) {
        const propName = bindingKey.slice(1, -1);
        if (propName.startsWith('class.')) {
          const className = propName.slice(6);
          bindClass(element, className, () => {
            const fn = (instance as any)[expr.replace(/\(\)$/, '')];
            return typeof fn === 'function'
              ? Boolean(fn.call(instance))
              : Boolean((instance as any)[expr]);
          });
        } else if (propName.startsWith('style.')) {
          const styleProp = propName.slice(6);
          bindStyle(element, styleProp, () => {
            const fn = (instance as any)[expr.replace(/\(\)$/, '')];
            return typeof fn === 'function' ? fn.call(instance) : (instance as any)[expr];
          });
        } else {
          bindProp(element, propName, () => {
            const fn = (instance as any)[expr.replace(/\(\)$/, '')];
            return typeof fn === 'function' ? fn.call(instance) : (instance as any)[expr];
          });
        }
      } else if (bindingKey.startsWith('(') && bindingKey.endsWith(')')) {
        const eventName = bindingKey.slice(1, -1);
        bindEvent(element, eventName, (event: any) => {
          const fn = (instance as any)[expr.replace(/\(\$event\)$|\(\)$/, '')];
          if (typeof fn === 'function') {
            fn.call(instance, event);
          }
        });
      }
    }
  }

  return instance;
}

/**
 * Checks if a directive's selector matches a given HTML element
 */
export function matchesDirective(directiveType: any, element: HTMLElement): boolean {
  const def = getDirectiveDef(directiveType);
  if (!def || !def.metadata?.selector) return false;

  const selector = def.metadata.selector.trim();
  try {
    return element.matches(selector);
  } catch {
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const attrName = selector.slice(1, -1);
      return element.hasAttribute(attrName) || (element as any)[attrName] !== undefined;
    }
    return false;
  }
}

/**
 * Scans the component context's `imports` array and automatically instantiates
 * and binds any matching directives to the given element.
 */
export function applyMatchingDirectives(
  element: HTMLElement,
  ctx: any,
  parentInjector: Injector = rootInjector
): any[] {
  if (!ctx || !element) return [];
  const def = ctx.constructor?.[COMPONENT_DEF] || ctx[COMPONENT_DEF];
  const imports = def?.metadata?.imports;
  if (!Array.isArray(imports)) return [];

  const instances: any[] = [];
  for (const item of imports) {
    if (item && item[DIRECTIVE_DEF]) {
      if (matchesDirective(item, element)) {
        const instance = applyDirective(item, element, parentInjector);
        instances.push(instance);
      }
    }
  }
  return instances;
}
