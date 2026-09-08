import type { Provider } from './di.ts';
import { ɵcmp, COMPONENT_DEF } from './defs.ts';
export { ɵcmp, COMPONENT_DEF };

export const ViewEncapsulation = {
  Emulated: 0,
  None: 2,
} as const;
export type ViewEncapsulation = (typeof ViewEncapsulation)[keyof typeof ViewEncapsulation];

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/^-/, '');
}

export interface ComponentMetadata {
  selector?: string;
  template: string;
  imports?: any[];
  styles?: string[];
  encapsulation?: ViewEncapsulation;
  providers?: Provider[];
}

export interface ComponentDef<T = any> {
  selector: string;
  imports?: any[];
  styles?: string[];
  scopeId?: string;
  render?: (ctx: any, injector: any) => Node[];
  type: new (...args: any[]) => T;
  metadata: ComponentMetadata;
}

export interface ComponentType<T = any> {
  new (...args: any[]): T;
  ɵcmp?: ComponentDef<T>;
  ɵrender?: (ctx: T, injector: any) => Node[];
  __angora_render__?: (ctx: T, injector: any) => Node[];
  __angora_scope_id__?: string;
  __angora_styles__?: string[];
}

/**
 * Component decorator defining an Angora component
 * @example
 * @Component({
 *   template: `
 *     <h1>Count: {{ count() }}</h1>
 *     <button (click)="count.inc()">+</button>
 *   `
 * })
 * export class CounterComponent {
 *   count = signal(0);
 * }
 */
export function Component(metadata: ComponentMetadata) {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    const selector = metadata.selector || toKebabCase(target.name || 'angora-component');
    const def: ComponentDef<InstanceType<T>> = {
      selector,
      imports: metadata.imports,
      styles: metadata.styles,
      type: target,
      metadata: {
        ...metadata,
        selector,
      },
    };
    const compTarget = target as unknown as ComponentType<InstanceType<T>>;
    compTarget.ɵcmp = def;
    return target;
  };
}

export function getComponentDef<T>(target: any): ComponentDef<T> | undefined {
  return target?.ɵcmp ?? target?.[COMPONENT_DEF];
}

export interface FunctionalComponentOptions<T = any> {
  selector?: string;
  template: string;
  imports?: any[];
  styles?: string[];
  providers?: Provider[];
  setup?: (ctx: any) => T | void;
}

export type ComponentFactoryFn<T = any> = () => T & {
  template: string;
  selector?: string;
  styles?: string[];
};

/**
 * Functional component factory for defining concise, class-less components
 * @example
 * export const Counter = component({
 *   template: `<button (click)="count.inc()">Count: {{ count() }}</button>`,
 *   setup() {
 *     const count = signal(0);
 *     return { count };
 *   }
 * });
 */
export function component<T extends object = any>(
  optionsOrFn: FunctionalComponentOptions<T> | ComponentFactoryFn<T>
): ComponentType<T> {
  let metadata: ComponentMetadata;
  let setupFn: ((ctx: any) => any) | undefined;

  if (typeof optionsOrFn === 'function') {
    setupFn = optionsOrFn;
    metadata = {
      selector: 'angora-component',
      template: '',
    };
  } else {
    metadata = {
      selector: optionsOrFn.selector || 'angora-component',
      template: optionsOrFn.template,
      imports: optionsOrFn.imports,
      styles: optionsOrFn.styles,
      providers: optionsOrFn.providers,
    };
    setupFn = optionsOrFn.setup;
  }

  function FunctionalComponent(this: any) {
    if (setupFn) {
      const state = setupFn(this);
      if (state && typeof state === 'object') {
        Object.assign(this, state);
        if (state.template && !metadata.template) {
          metadata.template = state.template;
        }
        if (state.selector && metadata.selector === 'angora-component') {
          metadata.selector = state.selector;
        }
      }
    }
  }

  const def: ComponentDef<any> = {
    selector: metadata.selector || 'angora-component',
    imports: metadata.imports,
    styles: metadata.styles,
    type: FunctionalComponent as any,
    metadata,
  };

  (FunctionalComponent as any)[COMPONENT_DEF] = def;
  (FunctionalComponent as any).ɵcmp = def;

  return FunctionalComponent as any;
}

export const defineComponent = component;
