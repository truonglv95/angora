import { ɵpipe, PIPE_DEF } from './defs.ts';
export { ɵpipe, PIPE_DEF };

export interface PipeMetadata {
  name: string;
  pure?: boolean;
}

export interface PipeTransform {
  transform(value: any, ...args: any[]): any;
}

export interface PipeDef<T = any> {
  name: string;
  pure?: boolean;
  type: new (...args: any[]) => T;
  metadata: PipeMetadata;
}

export interface PipeType<T = any> {
  new (...args: any[]): T;
  ɵpipe?: PipeDef<T>;
}

/**
 * Decorator defining an Angora pure or impure data transformation Pipe
 * @example
 * @Pipe({ name: 'uppercase', pure: true })
 * export class UpperCasePipe implements PipeTransform {
 *   transform(value: string): string {
 *     return value ? value.toUpperCase() : '';
 *   }
 * }
 */
export function Pipe(metadata: PipeMetadata) {
  return function <T extends { new (...args: any[]): any }>(target: T) {
    const def: PipeDef<InstanceType<T>> = {
      name: metadata.name,
      pure: metadata.pure ?? true,
      type: target,
      metadata: {
        name: metadata.name,
        pure: metadata.pure ?? true,
      },
    };
    const pipeTarget = target as unknown as PipeType<InstanceType<T>>;
    pipeTarget.ɵpipe = def;
    return target;
  };
}

export function getPipeDef<T>(target: any): PipeDef<T> | undefined {
  return target?.ɵpipe ?? target?.[PIPE_DEF];
}

/**
 * Helper to wrap a pure transform function with argument memoization
 */
export function memoizePipe<T extends (...args: any[]) => any>(fn: T): T {
  let lastArgs: any[] | null = null;
  let lastResult: any = undefined;

  return ((...args: any[]) => {
    if (lastArgs && args.length === lastArgs.length) {
      let match = true;
      for (let i = 0; i < args.length; i++) {
        if (!Object.is(args[i], lastArgs[i])) {
          match = false;
          break;
        }
      }
      if (match) return lastResult;
    }

    lastArgs = args.slice();
    lastResult = fn(...args);
    return lastResult;
  }) as T;
}

export interface FunctionalPipe<TIn = any, TOut = any> {
  (value: TIn, ...args: any[]): TOut;
  transform(value: TIn, ...args: any[]): TOut;
  name: string;
  pure: boolean;
  ɵpipe: PipeDef<any>;
}

/**
 * Creates a lightweight functional pipe for template or TS transformations
 * @example
 * export const reverse = pipe('reverse', (s: string) => s.split('').reverse().join(''));
 * export const truncate = pipe((val: string, max = 10) => val.slice(0, max), 'truncate');
 */
export function pipe<TIn = any, TOut = any>(
  name: string,
  transformFn: (value: TIn, ...args: any[]) => TOut,
  options?: { pure?: boolean }
): FunctionalPipe<TIn, TOut>;
export function pipe<TIn = any, TOut = any>(
  transformFn: (value: TIn, ...args: any[]) => TOut,
  options?: { name?: string; pure?: boolean } | string
): FunctionalPipe<TIn, TOut>;
export function pipe<TIn = any, TOut = any>(
  nameOrFn: string | ((value: TIn, ...args: any[]) => TOut),
  optionsOrFn?: ((value: TIn, ...args: any[]) => TOut) | { name?: string; pure?: boolean } | string,
  extraOptions?: { pure?: boolean }
): FunctionalPipe<TIn, TOut> {
  let name: string;
  let transformFn: (value: TIn, ...args: any[]) => TOut;
  let pure = true;

  if (typeof nameOrFn === 'string') {
    name = nameOrFn;
    transformFn = optionsOrFn as (value: TIn, ...args: any[]) => TOut;
    if (extraOptions && typeof extraOptions.pure === 'boolean') {
      pure = extraOptions.pure;
    }
  } else {
    transformFn = nameOrFn;
    if (typeof optionsOrFn === 'string') {
      name = optionsOrFn;
    } else if (typeof optionsOrFn === 'object' && optionsOrFn !== null) {
      name = optionsOrFn.name || nameOrFn.name || 'pipe';
      pure = optionsOrFn.pure ?? true;
    } else {
      name = nameOrFn.name || 'pipe';
    }
  }

  const finalFn = pure ? memoizePipe(transformFn) : transformFn;

  const functionalPipe = ((value: TIn, ...args: any[]) => {
    return finalFn(value, ...args);
  }) as unknown as FunctionalPipe<TIn, TOut>;

  functionalPipe.transform = (value: TIn, ...args: any[]) => {
    return finalFn(value, ...args);
  };

  const def: PipeDef<any> = {
    name,
    pure,
    type: functionalPipe as any,
    metadata: {
      name,
      pure,
    },
  };

  try {
    Object.defineProperty(functionalPipe, 'name', { value: name, configurable: true });
  } catch {}
  functionalPipe.pure = pure;
  functionalPipe.ɵpipe = def;
  (functionalPipe as any)[PIPE_DEF] = def;

  return functionalPipe;
}

// Built-in Standard Pipes

@Pipe({ name: 'uppercase', pure: true })
export class UpperCasePipe implements PipeTransform {
  transform(value: any): string {
    return value === null || value === undefined ? '' : String(value).toUpperCase();
  }
}

@Pipe({ name: 'lowercase', pure: true })
export class LowerCasePipe implements PipeTransform {
  transform(value: any): string {
    return value === null || value === undefined ? '' : String(value).toLowerCase();
  }
}

@Pipe({ name: 'json', pure: true })
export class JsonPipe implements PipeTransform {
  transform(value: any, indent = 2): string {
    try {
      return JSON.stringify(value, null, indent);
    } catch {
      return String(value);
    }
  }
}

@Pipe({ name: 'date', pure: true })
export class DatePipe implements PipeTransform {
  transform(value: any, format = 'short'): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return String(value);

    if (format === 'short') {
      return (
        date.toLocaleDateString() +
        ', ' +
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    }
    if (format === 'shortDate') {
      return date.toLocaleDateString();
    }
    if (format === 'iso') {
      return date.toISOString();
    }
    return date.toLocaleString();
  }
}

@Pipe({ name: 'currency', pure: true })
export class CurrencyPipe implements PipeTransform {
  transform(
    value: any,
    currencyCode = 'USD',
    display: 'symbol' | 'code' | boolean = 'symbol'
  ): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    const displayMode: 'symbol' | 'code' =
      display === false || display === 'code' ? 'code' : 'symbol';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: displayMode,
    }).format(num);
  }
}

@Pipe({ name: 'slice', pure: true })
export class SlicePipe implements PipeTransform {
  transform(value: any, start: number, end?: number): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || Array.isArray(value)) {
      return value.slice(start, end);
    }
    return value;
  }
}
