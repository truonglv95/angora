import {
  Injector,
  rootInjector,
  UpperCasePipe,
  LowerCasePipe,
  JsonPipe,
  DatePipe,
  CurrencyPipe,
  SlicePipe,
  PIPE_DEF,
  COMPONENT_DEF,
  getComponentDef,
  getPipeDef,
  type PipeTransform,
} from '@angora-js/core';

const standardPipes: Record<string, new () => PipeTransform> = {
  uppercase: UpperCasePipe,
  lowercase: LowerCasePipe,
  json: JsonPipe,
  date: DatePipe,
  currency: CurrencyPipe,
  slice: SlicePipe,
};

const pipeInstancesCache = new WeakMap<any, Map<string, PipeTransform>>();

/**
 * Resolves a pipe instance by name from the component imports or standard built-in pipes
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

    // Standard built-in pipe
    const Builtin = standardPipes[normalizedName];
    if (Builtin) {
      const pipeInstance = new Builtin();
      instanceMap.set(normalizedName, pipeInstance);
      return pipeInstance;
    }
  }

  const Builtin = standardPipes[normalizedName];
  if (Builtin) {
    return new Builtin();
  }

  throw new Error(
    `[Angora Pipes] Pipe "${name}" not found. Ensure it is included in your component imports: [${name}Pipe].`
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
