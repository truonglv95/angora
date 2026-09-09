import {
  COMPONENT_DEF,
  Injector,
  rootInjector,
  effect,
  DefaultDestroyRef,
  DESTROY_REF,
  runWithDestroyRef,
  IS_VIEW_QUERY,
  isDevMode,
  resolveImports,
  resolveForwardRef,
  getComponentDef,
  type DestroyRef,
} from '@angora-js/core';
import { getJITCompiler } from './bootstrap.ts';
import { injectComponentStyles } from './styles.ts';
import { attachComponentDevTools } from './devtools.ts';
import { applyMatchingDirectives } from './directives.ts';
import { hmrRegistry } from './hmr.ts';

export interface MountComponentOptions {
  inputs?: Record<string, () => any>;
  outputs?: Record<string, (event: any) => void>;
  projectedNodes?: () => Node[];
}

export interface MountedComponentRef<T = any> {
  instance: T;
  hostElement: HTMLElement;
  injector: Injector;
  destroy: () => void;
  rerender?: (newRenderFn?: (ctx: any, inj: any) => Node[]) => void;
  childNodes?: Node[];
  componentType?: any;
}

/**
 * Finds an imported component constructor from the parent component's context imports
 */
export function findImportedComponent(ctx: any, tagName: string): any {
  if (!ctx) return undefined;
  const def =
    ctx.constructor?.[COMPONENT_DEF] ||
    ctx[COMPONENT_DEF] ||
    getComponentDef(ctx.constructor) ||
    getComponentDef(ctx);
  const imports = resolveImports(def?.metadata?.imports ?? def?.imports);
  if (!imports.length) return undefined;

  const normalizedTag = tagName.toLowerCase();
  for (const rawItem of imports) {
    const item = resolveForwardRef(rawItem);
    if (!item) continue;
    const itemDef = item?.[COMPONENT_DEF] || item?.ɵcmp || getComponentDef(item);
    const selector = itemDef?.metadata?.selector?.toLowerCase() || itemDef?.selector?.toLowerCase();
    if (selector === normalizedTag || item.name?.toLowerCase() === normalizedTag) {
      return item;
    }
  }
  return undefined;
}

/**
 * Mounts a child Angora standalone component into a host element
 */
export function mountComponent<T = any>(
  componentOrTag: string | (new (...args: any[]) => T),
  hostElement: HTMLElement,
  ctx: any,
  parentInjector: Injector = rootInjector,
  options: MountComponentOptions = {}
): MountedComponentRef<T> | null {
  parentInjector = parentInjector || rootInjector;
  const componentType: any =
    typeof componentOrTag === 'string'
      ? findImportedComponent(ctx, componentOrTag)
      : componentOrTag;

  if (!componentType) {
    // Warn in dev mode if custom element tag was used without importing component
    if (isDevMode() && typeof componentOrTag === 'string' && componentOrTag.includes('-')) {
      const parentName = ctx?.constructor?.name || 'Component';
      console.warn(
        `[Angora Warning] NG8001: '${componentOrTag}' is not a known element.\n` +
          `If '${componentOrTag}' is an Angora component, verify that it is included in the '@Component.imports' array of ${parentName}.`
      );
    }

    // Apply any matching directives from context imports to native element
    applyMatchingDirectives(hostElement, ctx, parentInjector);

    // If not a registered Angora component, bind properties and events natively
    if (options.inputs) {
      for (const [propName, getter] of Object.entries(options.inputs)) {
        effect(() => {
          (hostElement as any)[propName] = getter();
        });
      }
    }
    if (options.outputs) {
      for (const [eventName, handler] of Object.entries(options.outputs)) {
        hostElement.addEventListener(eventName, (e: any) => handler(e?.detail ?? e));
      }
    }
    if (options.projectedNodes) {
      const nodes = options.projectedNodes();
      for (const n of nodes) {
        hostElement.appendChild(n);
      }
    }
    return null;
  }

  const def = componentType[COMPONENT_DEF];
  const destroyRef = new DefaultDestroyRef();
  const cleanups: (() => void)[] = [];

  // 1. Create hierarchical child injector
  const providers = [
    componentType,
    { provide: DESTROY_REF, useValue: destroyRef },
    ...(def?.metadata?.providers || []),
  ];
  const childInjector = new Injector(providers, parentInjector);

  // 2. Instantiate component inside lifecycle scope
  const instance: any = runWithDestroyRef(destroyRef, () => {
    return childInjector.get(componentType);
  });

  // Attach projected nodes getter if present
  if (options.projectedNodes) {
    let cachedNodes: Node[] | null = null;
    const getNodes = () => {
      if (!cachedNodes) {
        cachedNodes = options.projectedNodes!();
      }
      return cachedNodes;
    };
    (instance as any).__projectedNodes = (selector?: string) => {
      const allNodes = getNodes();
      if (!selector || selector === '*') {
        return allNodes.filter(n => {
          if (n.nodeType === 1 /* ELEMENT_NODE */) {
            return !(n as HTMLElement).hasAttribute('data-angora-projected');
          }
          return true;
        });
      }
      return allNodes.filter(n => {
        if (n.nodeType === 1 /* ELEMENT_NODE */) {
          const el = n as HTMLElement;
          if (el.matches && el.matches(selector)) {
            el.setAttribute('data-angora-projected', '');
            return true;
          }
        }
        return false;
      });
    };
  }

  // 3. Bind reactive inputs
  if (options.inputs) {
    for (const [propName, getter] of Object.entries(options.inputs)) {
      const inputProp = instance[propName];
      if (inputProp && typeof inputProp.__set === 'function') {
        // Angora InputSignal
        const stopEffect = effect(() => {
          const val = getter();
          inputProp.__set(val);
        });
        cleanups.push(stopEffect);
      } else {
        // Plain property binding
        const stopEffect = effect(() => {
          instance[propName] = getter();
        });
        cleanups.push(stopEffect);
      }
    }
  }

  // 3.5 Bind static attributes from hostElement to input signals
  if (hostElement && hostElement.attributes) {
    for (let i = 0; i < hostElement.attributes.length; i++) {
      const attr = hostElement.attributes[i];
      const attrName = attr.name;
      if (
        attrName.startsWith('_angora-') ||
        attrName === 'class' ||
        attrName === 'style' ||
        attrName === 'id'
      ) {
        continue;
      }
      const camelName = attrName.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      const propName = camelName in instance ? camelName : attrName in instance ? attrName : null;
      if (propName && (!options.inputs || !(propName in options.inputs))) {
        const inputProp = (instance as any)[propName];
        if (inputProp && typeof inputProp.__set === 'function') {
          let val: any = attr.value;
          const currentVal = inputProp();
          if (typeof currentVal === 'boolean') {
            val = attr.value === '' || attr.value === 'true';
          } else if (typeof currentVal === 'number' && !isNaN(Number(attr.value))) {
            val = Number(attr.value);
          }
          inputProp.__set(val);
        } else if (propName in instance) {
          (instance as any)[propName] = attr.value;
        }
      }
    }
  }

  // 4. Bind event outputs
  if (options.outputs) {
    for (const [eventName, handler] of Object.entries(options.outputs)) {
      let outputProp = instance[eventName];
      if (!outputProp && eventName.endsWith('Change')) {
        const modelPropName = eventName.slice(0, -6);
        const modelSignal = instance[modelPropName];
        if (modelSignal && typeof modelSignal.subscribe === 'function') {
          outputProp = modelSignal;
        }
      }
      if (outputProp && typeof outputProp.subscribe === 'function') {
        const unsubscribe = outputProp.subscribe(handler);
        cleanups.push(unsubscribe);
      }
    }
  }

  // 4.5 Inject component scoped styles if defined
  const scopeId =
    def?.scopeId ||
    (componentType as any).__angora_scope_id__ ||
    (instance as any).__angora_scope_id__ ||
    (def?.metadata?.selector
      ? `_angora-${def.metadata.selector.replace(/[^a-zA-Z0-9]/g, '-')}`
      : null);

  if (scopeId) {
    const rawStyles =
      def?.styles || (componentType as any).__angora_styles__ || def?.metadata?.styles;
    if (Array.isArray(rawStyles)) {
      for (const s of rawStyles) {
        if (typeof s === 'string' && s.trim()) {
          injectComponentStyles(scopeId, s);
        }
      }
    } else if (typeof rawStyles === 'string' && rawStyles.trim()) {
      injectComponentStyles(scopeId, rawStyles);
    }
  }

  // 5. Render child template
  let renderFn =
    def?.render ||
    componentType.ɵrender ||
    instance.ɵrender ||
    instance.__angora_render__ ||
    componentType.__angora_render__;
  if (!renderFn && getJITCompiler() && def?.metadata?.template) {
    try {
      renderFn = getJITCompiler()!(def.metadata.template, { selector: def.metadata.selector });
      componentType.ɵrender = renderFn;
      componentType.__angora_render__ = renderFn;
    } catch (err) {
      console.error(`[Angora JIT] Failed to compile template for <${def.metadata.selector}>:`, err);
    }
  }

  let renderDestroyRef = new DefaultDestroyRef();
  let renderInjector = new Injector(
    [{ provide: DESTROY_REF, useValue: renderDestroyRef }],
    childInjector
  );

  let mountedChildNodes: Node[] = [];
  if (typeof renderFn === 'function') {
    const hasInitialChildren = hostElement.hasChildNodes();
    const rootChildNode = hasInitialChildren
      ? hostElement.firstElementChild || hostElement.firstChild || undefined
      : undefined;
    const childNodes: Node[] = renderFn(instance, renderInjector, rootChildNode);
    mountedChildNodes = childNodes;
    if (!hasInitialChildren) {
      for (const node of childNodes) {
        hostElement.appendChild(node);
      }
    }
  }

  const resolveViewQueries = () => {
    for (const key of Object.keys(instance)) {
      const prop = (instance as any)[key];
      if (prop && prop[IS_VIEW_QUERY]) {
        const selector = prop.__selector;
        const refVal = (instance as any)[selector];
        if (refVal) {
          prop.__set(refVal);
        } else {
          const found =
            hostElement.querySelector(selector) ||
            hostElement.querySelector(`[${selector}]`) ||
            hostElement.querySelector(`#${selector}`);
          if (found) prop.__set(found);
        }
      }
    }
  };

  const rerender = (newRenderFn?: (ctx: any, inj: any) => Node[]) => {
    const activeRenderFn =
      newRenderFn ||
      componentType.ɵrender ||
      componentType.__angora_render__ ||
      componentType.ɵcmp?.render;
    if (typeof activeRenderFn === 'function') {
      try {
        renderDestroyRef.destroy();
      } catch (e) {
        console.error('[Angora HMR] Error cleaning up render scope:', e);
      }
      renderDestroyRef = new DefaultDestroyRef();
      renderInjector = new Injector(
        [{ provide: DESTROY_REF, useValue: renderDestroyRef }],
        childInjector
      );

      for (const node of mountedChildNodes) {
        if (node.parentNode === hostElement) {
          hostElement.removeChild(node);
        }
      }
      const newChildNodes = activeRenderFn(instance, renderInjector);
      mountedChildNodes = newChildNodes;
      for (const node of newChildNodes) {
        hostElement.appendChild(node);
      }
      resolveViewQueries();
    }
  };

  // 5.5 Resolve viewChild queries
  resolveViewQueries();

  // 6. Execute OnInit lifecycle hook
  if (typeof instance.angoraOnInit === 'function') {
    instance.angoraOnInit();
  }

  // 6.5 Attach DevTools hooks in development mode
  attachComponentDevTools(instance, hostElement, componentType, def, ctx, destroyRef);

  // 7. Cleanup & destruction handler
  let isDestroyed = false;
  const destroy = () => {
    if (isDestroyed) return;
    isDestroyed = true;

    hmrRegistry.unregister(componentType, ref);

    if (typeof instance.angoraOnDestroy === 'function') {
      instance.angoraOnDestroy();
    }
    try {
      renderDestroyRef.destroy();
    } catch {}
    destroyRef.destroy();

    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (err) {
        console.error('[Angora] Error cleaning up component:', err);
      }
    }
    cleanups.length = 0;
    hostElement.innerHTML = '';
  };

  // Register with parent destroyRef if present in injector
  const parentDestroyRef = parentInjector?.get ? parentInjector.get(DESTROY_REF, null) : null;
  if (parentDestroyRef) {
    parentDestroyRef.onDestroy(destroy);
  }

  const ref: MountedComponentRef<T> = {
    instance: instance as T,
    hostElement,
    injector: childInjector,
    destroy,
    rerender,
    childNodes: mountedChildNodes,
    componentType,
  };

  hmrRegistry.register(componentType, ref);

  return ref;
}
