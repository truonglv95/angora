let _isDevMode = true;

/**
 * Returns whether the application is running in development mode.
 */
export function isDevMode(): boolean {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return false;
  }
  if ((globalThis as any).__ANGORA_PROD__ === true) {
    return false;
  }
  return _isDevMode;
}

/**
 * Disables development mode checks and optimizations for production.
 */
export function enableProdMode(): void {
  _isDevMode = false;
  (globalThis as any).__ANGORA_PROD__ = true;
}

/**
 * Resets the mode back to development (primarily for testing purposes).
 */
export function resetDevMode(): void {
  _isDevMode = true;
  delete (globalThis as any).__ANGORA_PROD__;
}
