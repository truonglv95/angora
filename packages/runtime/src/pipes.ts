import {
  Injector,
  rootInjector,
  PIPE_DEF,
  COMPONENT_DEF,
  getComponentDef,
  getPipeDef,
  type PipeTransform,
} from '@angora-js/core';

const pipeInstancesCache = new WeakMap<any, Map<string, PipeTransform>>();
const dynamicPipeRegistry = new Map<string, new () => PipeTransform>();

/**
 * Registers a pipe class dynamically or globally
 */
export function registerPipe(name: string, pipe: new () => PipeTransform) {
  dynamicPipeRegistry.set(name.toLowerCase(), pipe);
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
    const imports = compDef?.metadata?.imports;
    if (Array.isArray(imports)) {
      for (const item of imports) {
        const pipeDef = getPipeDef(item);
        if (pipeDef && pipeDef.metadata.name.toLowerCase() === normalizedName) {
          const pipeInstance = injector ? injector.get(item, new item()) : new item();
          instanceMap.set(normalizedName, pipeInstance);
          return pipeInstance;
        }
      }
    }
  }

  // Check dynamic registry
  const Registered = dynamicPipeRegistry.get(normalizedName);
  if (Registered) {
    return new Registered();
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
