import type { Provider } from './di.ts';
import { ɵcmp, COMPONENT_DEF } from './defs.ts';
import { resolveImports } from './forward-ref.ts';
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

export type ComponentImports = any[] | (() => any[]);

export interface ComponentMetadata {
  selector?: string;
  template?: string;
  imports?: ComponentImports;
  styles?: string[];
  encapsulation?: ViewEncapsulation;
  providers?: Provider[];
}

export interface ComponentDef<T = any> {
  selector: string;
  imports?: ComponentImports;
  styles?: string[];
  scopeId?: string;
  render?: (ctx: any, injector: any) => Node[];
  ssrRender?: (ctx: any, injector: any) => string;
  type: new (...args: any[]) => T;
  metadata: ComponentMetadata;
}

export interface ComponentType<T = any> {
  new (...args: any[]): T;
  ɵcmp?: ComponentDef<T>;
  ɵrender?: (ctx: T, injector: any) => Node[];
  ssrRender?: (ctx: T, injector: any) => string;
  __angora_render__?: (ctx: T, injector: any) => Node[];
  __angora_scope_id__?: string;
  __angora_styles__?: string[];
}

export type ComponentMetadataInput = ComponentMetadata | string | TemplateStringsArray;

/**
 * Tagged template literal for HTML templates providing syntax highlighting and string interpolation.
 */
export function html(strings: TemplateStringsArray, ...values: any[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }
  return result;
}

/**
 * Tagged template literal for CSS stylesheets providing syntax highlighting.
 */
export function css(strings: TemplateStringsArray, ...values: any[]): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }
  return result;
}

/**
 * Component decorator defining an Angora component
 * Supports:
 * - Full metadata object: `@Component({ template: '...', selector: '...' })`
 * - Shorthand template string: `@Component('<h1>{{ count }}</h1>')`
 * - Shorthand tagged template: `@Component(html`<h1>{{ count }}</h1>`)` or `@Component`\`<h1>{{ count }}</h1>\``
 * - Shorthand template file path: `@Component('./counter.html')`
 * - Zero-config convention: `@Component()` or bare `@Component`
 * @example
 * @Component(`
 *   <h1>Count: {{ count }}</h1>
 *   <button (click)="count.inc()">+</button>
 * `)
 * export class CounterComponent {
 *   count = signal(0);
 * }
 */
export function Component(
  metadataOrTemplate?: ComponentMetadataInput | Function,
  ...restValues: any[]
): any {
  if (typeof metadataOrTemplate === 'function') {
    // Bare decorator: @Component
    const target = metadataOrTemplate as any;
    const selector = toKebabCase(target.name || 'angora-component');
    const def: ComponentDef<any> = {
      selector,
      type: target,
      metadata: { selector, template: '' },
    };
    const compTarget = target as unknown as ComponentType<any>;
    compTarget.ɵcmp = def;
    compTarget[COMPONENT_DEF] = def;
    return target;
  }

  // Tagged template usage: @Component`<h1>...</h1>`
  if (Array.isArray(metadataOrTemplate) && 'raw' in metadataOrTemplate) {
    let tmpl = '';
    const strings = metadataOrTemplate as TemplateStringsArray;
    for (let i = 0; i < strings.length; i++) {
      tmpl += strings[i];
      if (i < restValues.length) {
        tmpl += restValues[i];
      }
    }
    return function <T extends { new (...args: any[]): any }>(target: T) {
      const selector = toKebabCase(target.name || 'angora-component');
      const def: ComponentDef<InstanceType<T>> = {
        selector,
        type: target,
        metadata: { selector, template: tmpl },
      };
      const compTarget = target as unknown as ComponentType<InstanceType<T>>;
      compTarget.ɵcmp = def;
      compTarget[COMPONENT_DEF] = def;
      return target;
    };
  }

  return function <T extends { new (...args: any[]): any }>(target: T) {
    let metadata: ComponentMetadata;
    if (typeof metadataOrTemplate === 'string') {
      metadata = {
        template: metadataOrTemplate,
      };
    } else if (metadataOrTemplate && typeof metadataOrTemplate === 'object') {
      metadata = metadataOrTemplate as ComponentMetadata;
    } else {
      metadata = {
        template: '',
      };
    }

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
    compTarget[COMPONENT_DEF] = def;
    return target;
  };
}

export function getComponentDef<T>(target: any): ComponentDef<T> | undefined {
  return target?.ɵcmp ?? target?.[COMPONENT_DEF];
}

/**
 * Returns the fully resolved array of imported components, directives, and pipes
 * for a component class or instance, unwrapping any thunk functions and forwardRef calls.
 */
export function getComponentImports(target: any): any[] {
  const def = getComponentDef(target);
  return resolveImports(def?.imports ?? def?.metadata?.imports);
}

export interface FunctionalComponentOptions<T = any> {
  selector?: string;
  template: string;
  imports?: ComponentImports;
  styles?: string[];
  scopeId?: string;
  providers?: Provider[];
  setup?: (ctx: any) => T | void;
  render?: (ctx: any, injector: any) => Node[];
  ssrRender?: (ctx: any, injector: any) => string;
}

export type ComponentFactoryFn<T = any> = () => T & {
  template: string;
  selector?: string;
  styles?: string[];
};

/**
 * Functional component factory for defining concise, class-less components
 * @example
 * export const Counter = component(
 *   `<button (click)="count.inc()">Count: {{ count() }}</button>`,
 *   () => {
 *     const count = signal(0);
 *     return { count };
 *   }
 * );
 */
export function component<T extends object = any>(
  optionsOrFnOrTemplate: FunctionalComponentOptions<T> | ComponentFactoryFn<T> | string,
  maybeSetup?: (ctx: any) => T | void
): ComponentType<T> {
  let metadata: ComponentMetadata;
  let setupFn: ((ctx: any) => any) | undefined;

  if (typeof optionsOrFnOrTemplate === 'string') {
    metadata = {
      selector: 'angora-component',
      template: optionsOrFnOrTemplate,
    };
    setupFn = maybeSetup;
  } else if (typeof optionsOrFnOrTemplate === 'function') {
    setupFn = optionsOrFnOrTemplate;
    metadata = {
      selector: 'angora-component',
      template: '',
    };
  } else {
    metadata = {
      selector: optionsOrFnOrTemplate.selector || 'angora-component',
      template: optionsOrFnOrTemplate.template,
      imports: optionsOrFnOrTemplate.imports,
      styles: optionsOrFnOrTemplate.styles,
      providers: optionsOrFnOrTemplate.providers,
    };
    setupFn = optionsOrFnOrTemplate.setup;
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

  const isObj = typeof optionsOrFnOrTemplate === 'object' && optionsOrFnOrTemplate !== null;
  const opts = isObj ? (optionsOrFnOrTemplate as any) : {};

  const def: ComponentDef<any> = {
    selector: metadata.selector || 'angora-component',
    imports: metadata.imports,
    styles: metadata.styles,
    scopeId: opts.scopeId,
    render: opts.render,
    ssrRender: opts.ssrRender,
    type: FunctionalComponent as any,
    metadata,
  };

  const compTarget = FunctionalComponent as unknown as ComponentType<any>;
  compTarget[COMPONENT_DEF] = def;
  compTarget.ɵcmp = def;

  if (opts.render) {
    compTarget.ɵrender = opts.render;
    compTarget.__angora_render__ = opts.render;
  }
  if (opts.ssrRender) {
    compTarget.ssrRender = opts.ssrRender;
  }
  if (opts.scopeId) {
    compTarget.__angora_scope_id__ = opts.scopeId;
  }
  if (metadata.styles) {
    compTarget.__angora_styles__ = metadata.styles;
  }

  return FunctionalComponent as any;
}

export const defineComponent = component;
