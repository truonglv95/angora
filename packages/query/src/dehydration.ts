import type { QueryClient } from './query-client.ts';
import type { DehydratedState } from './types.ts';

export const DEHYDRATION_SCRIPT_ID = '__ANGORA_QUERY_DATA__';

/**
 * Dehydrates a QueryClient into a serializable state for SSR
 */
export function dehydrate(client: QueryClient): DehydratedState {
  return client.dehydrate();
}

/**
 * Hydrates a QueryClient from a dehydrated SSR state
 */
export function hydrate(client: QueryClient, state: DehydratedState): void {
  client.hydrate(state);
}

/**
 * Generates an inline JSON script tag containing dehydrated query state for SSR HTML streaming
 */
export function renderDehydratedScript(state: DehydratedState): string {
  const json = JSON.stringify(state).replace(/</g, '\\u003c');
  return `<script id="${DEHYDRATION_SCRIPT_ID}" type="application/json">${json}</script>`;
}

/**
 * Automatically extracts and parses dehydrated query state from document in browser
 */
export function extractDehydratedState(): DehydratedState | null {
  if (typeof document === 'undefined') return null;
  const script = document.getElementById(DEHYDRATION_SCRIPT_ID);
  if (!script || !script.textContent) return null;
  try {
    return JSON.parse(script.textContent);
  } catch {
    return null;
  }
}
