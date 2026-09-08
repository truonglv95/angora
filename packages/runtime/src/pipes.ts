import {
  Injector,
  rootInjector,
  PIPE_DEF,
  COMPONENT_DEF,
  getComponentDef,
  getPipeDef,
  resolveImports,
  resolveForwardRef,
  type PipeTransform,
} from '@angora-js/core';

const pipeInstancesCache = new WeakMap<any, Map<string, PipeTransform>>();
const dynamicPipeRegistry = new Map<string, new () => PipeTransform>();

/**
 * Registers a pipe class or functional pipe dynamically or globally
 */
export function registerPipe(name: string, pipe: PipeTransform | (new () => PipeTransform)) {
  dynamicPipeRegistry.set(name.toLowerCase(), pipe as any);
}

/**
 * Resolves a pipe instance by name from the component imports or dynamic registry
 */
export function resolvePipe(name: string, ctx?: any, injector?: Injector): PipeTransform {
  const normalizedName = name.toLowerCase();

  if (ctx) {
    let instanceMap = pipeInstancesCache.get(ctx);
    if (!instanceMap) {
      instanceMap = new Map();
      pipeInstancesCache.set(ctx, instanceMap);
    }
    const cached = instanceMap.get(normalizedName);
    if (cached) return cached;

    // Check imports in component metadata
    const compDef = getComponentDef(ctx.constructor) || getComponentDef(ctx);
    const imports = resolveImports(compDef?.metadata?.imports ?? compDef?.imports);
    for (const rawItem of imports) {
      const item = resolveForwardRef(rawItem);
      const pipeDef = getPipeDef(item);
      if (pipeDef && pipeDef.metadata.name.toLowerCase() === normalizedName) {
        const pipeInstance =
          typeof item?.transform === 'function'
            ? item
            : injector
              ? injector.get(item, new item())
              : new item();
        instanceMap.set(normalizedName, pipeInstance);
        return pipeInstance;
      }
    }
  }

  // Check dynamic registry
  const Registered = dynamicPipeRegistry.get(normalizedName);
  if (Registered) {
    if (typeof (Registered as any).transform === 'function') {
      return Registered as any;
    }
    return new (Registered as any)();
  }

  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  throw new Error(
    `[Angora Pipes] Pipe "${name}" not found. Ensure it is included in your component imports: [${capitalized}Pipe].`
  );
}

/**
 * Executes a pipe transform function with arguments
 */
export function applyPipe(
  name: string,
  value: any,
  args: any[] = [],
  ctx?: any,
  injector?: Injector
): any {
  const pipe = resolvePipe(name, ctx, injector);
  return pipe.transform(value, ...args);
}
