/**
 * An interface that represents a function returning a reference to a type.
 */
export interface ForwardRefFn<T = any> {
  (): T;
  __forward_ref__?: typeof forwardRef;
}

/**
 * Allows to refer to references which are not yet defined.
 *
 * For instance, `forwardRef` is used when the token which we need to refer to for the purposes of
 * DI or component imports is declared, but not yet defined (Temporal Dead Zone - TDZ) or
 * in mutually recursive circular dependencies.
 *
 * @example
 * ```ts
 * @Component({
 *   selector: 'angora-menu',
 *   imports: [forwardRef(() => AngoraMenuItemComponent)],
 *   template: '...'
 * })
 * export class AngoraMenuComponent {}
 *
 * @Component({
 *   selector: 'angora-menu-item',
 *   template: '...'
 * })
 * export class AngoraMenuItemComponent {}
 * ```
 */
export function forwardRef<T>(forwardRefFn: () => T): any {
  (forwardRefFn as any).__forward_ref__ = forwardRef;
  (forwardRefFn as any).toString = function () {
    return `ForwardRef(${forwardRefFn.name || 'anonymous'})`;
  };
  return forwardRefFn;
}

/**
 * Resolves a forward reference if one was provided, otherwise returns the type as is.
 */
export function resolveForwardRef<T>(type: T | ForwardRefFn<T>): T {
  if (typeof type === 'function' && (type as any).__forward_ref__ === forwardRef) {
    return (type as any)();
  }
  return type as T;
}

/**
 * Checks if a value is a forward reference.
 */
export function isForwardRef(val: any): boolean {
  return typeof val === 'function' && (val as any).__forward_ref__ === forwardRef;
}

/**
 * Recursively flattens and resolves an imports array or thunk function, unwrapping any `forwardRef`.
 */
export function resolveImports(imports: any): any[] {
  if (!imports) return [];

  // Thunk function or forwardRef returning array or component
  if (typeof imports === 'function') {
    try {
      const resolved = imports();
      return resolveImports(resolved);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(imports)) {
    const resolved = resolveForwardRef(imports);
    return resolved != null ? [resolved] : [];
  }

  const result: any[] = [];
  for (const item of imports) {
    if (Array.isArray(item)) {
      result.push(...resolveImports(item));
    } else if (item != null) {
      const resolved = resolveForwardRef(item);
      if (Array.isArray(resolved)) {
        result.push(...resolveImports(resolved));
      } else if (resolved != null) {
        result.push(resolved);
      }
    }
  }
  return result;
}
