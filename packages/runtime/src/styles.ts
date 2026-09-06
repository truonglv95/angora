/**
 * Global registry of injected component styles for DOM and SSR
 */
const injectedStyleIds = new Set<string>();
const injectedStylesMap = new Map<string, string>();

/**
 * Injects scoped component CSS into the document <head>
 * Deduplicates multiple instances of the same component
 */
export function injectComponentStyles(scopeId: string, css: string): void {
  if (!css || !css.trim()) return;

  const styleId = `angora-style-${scopeId}`;
  injectedStylesMap.set(scopeId, css);

  if (injectedStyleIds.has(styleId)) {
    return;
  }

  injectedStyleIds.add(styleId);

  // In browser/DOM environment (including happy-dom)
  if (typeof document !== 'undefined' && document.head) {
    const existing = document.getElementById(styleId);
    if (!existing) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.setAttribute('data-angora-scope', scopeId);
      styleEl.textContent = css;
      document.head.appendChild(styleEl);
    }
  }
}

/**
 * Returns all currently injected scoped styles (useful for SSR output)
 */
export function getInjectedStyles(): Array<{ scopeId: string; css: string }> {
  const result: Array<{ scopeId: string; css: string }> = [];
  for (const [scopeId, css] of injectedStylesMap.entries()) {
    result.push({ scopeId, css });
  }
  return result;
}

/**
 * Clears injected styles cache (useful for test isolation)
 */
export function clearInjectedStyles(): void {
  injectedStyleIds.clear();
  injectedStylesMap.clear();
  if (typeof document !== 'undefined' && document.head) {
    const styles = document.head.querySelectorAll('style[id^="angora-style-"]');
    styles.forEach(s => s.remove());
  }
}
