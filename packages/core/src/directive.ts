import type { Provider } from './di.ts';
import { ɵdir, DIRECTIVE_DEF } from './defs.ts';
export { ɵdir, DIRECTIVE_DEF };

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/^-/, '');
}

export interface DirectiveMetadata {
  selector?: string;
  host?: Record<string, string>; // e.g. { '[class.active]': 'isActive()', '(click)': 'onClick($event)' }
  providers?: Provider[];
}

export interface DirectiveDef<T = any> {
  selector: string;
  host?: Record<string, string>;
  providers?: Provider[];
  type: new (...args: any[]) => T;
  metadata: DirectiveMetadata;
}

export interface DirectiveType<T = any> {
  new (...args: any[]): T;
  ɵdir?: DirectiveDef<T>;
}

/**
 * Wrapper providing direct access to native DOM element for directives
 */
export class ElementRef<T = HTMLElement> {
  constructor(public nativeElement: T) {}
}

/**
 * Decorator defining an Angora attribute or structural directive
 * @example
 * @Directive({
 *   selector: '[appHighlight]',
 *   host: {
 *     '[style.backgroundColor]': 'color()',
 *     '(mouseenter)': 'onMouseEnter()',
 *     '(mouseleave)': 'onMouseLeave()'
 *   }
 * })
 * export class HighlightDirective {
 *   color = signal('yellow');
 *   onMouseEnter() { this.color.set('orange'); }
 *   onMouseLeave() { this.color.set('yellow'); }
 * }
 */
export function Directive(metadata: DirectiveMetadata = {}) {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    const selector = metadata.selector || `[${toKebabCase(target.name || 'angora-directive')}]`;
    const def: DirectiveDef<InstanceType<T>> = {
      selector,
      host: metadata.host,
      providers: metadata.providers,
      type: target,
      metadata: {
        ...metadata,
        selector,
      },
    };
    const dirTarget = target as unknown as DirectiveType<InstanceType<T>>;
    dirTarget.ɵdir = def;
    return target;
  };
}

export function getDirectiveDef<T>(target: any): DirectiveDef<T> | undefined {
  return target?.ɵdir ?? target?.[DIRECTIVE_DEF];
}
