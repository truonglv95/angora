import type { FlipOptions } from './types.ts';

export interface FlipItem {
  element: HTMLElement;
  rect: DOMRect;
}

/**
 * Captures the current bounding client rect of elements before DOM mutation
 */
export function recordPositions(
  containerOrElements: HTMLElement | HTMLElement[]
): Map<HTMLElement, DOMRect> {
  const map = new Map<HTMLElement, DOMRect>();
  const elements = Array.isArray(containerOrElements)
    ? containerOrElements
    : (Array.from(containerOrElements.children) as HTMLElement[]);

  for (const el of elements) {
    if (el && typeof el.getBoundingClientRect === 'function') {
      map.set(el, el.getBoundingClientRect());
    }
  }

  return map;
}

/**
 * Animates elements from their recorded first positions to their new positions
 * using the FLIP (First, Last, Invert, Play) technique
 */
export async function animateFlip(
  firstPositions: Map<HTMLElement, DOMRect>,
  options: FlipOptions = {}
): Promise<void> {
  const duration = options.duration ?? 250;
  const easing = options.easing ?? 'cubic-bezier(0.2, 0, 0, 1)';
  const stagger = options.stagger ?? 0;

  const animations: Promise<void>[] = [];
  let index = 0;

  for (const [el, firstRect] of firstPositions.entries()) {
    if (!el.isConnected || typeof el.getBoundingClientRect !== 'function') continue;

    const lastRect = el.getBoundingClientRect();
    const dx = firstRect.left - lastRect.left;
    const dy = firstRect.top - lastRect.top;

    // If position hasn't changed, skip
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

    const delay = index * stagger;
    index++;

    if (typeof el.animate === 'function') {
      const animation = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        {
          duration,
          easing,
          delay,
          fill: options.fill ?? 'both',
        }
      );

      const promise = animation.finished
        ? animation.finished.then(() => {})
        : new Promise<void>(resolve => {
            animation.onfinish = () => resolve();
          });

      animations.push(promise);
    } else {
      // Inline transform fallback
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = `transform ${duration}ms ${easing}`;
      requestAnimationFrame(() => {
        el.style.transform = 'none';
      });
    }
  }

  if (animations.length > 0) {
    await Promise.all(animations);
  }
}

/**
 * Executes a list mutation while applying automatic FLIP animations to children
 *
 * @example
 * await flipList(todoListEl, () => {
 *   items.set(reorderedItems);
 * });
 */
export async function flipList(
  container: HTMLElement,
  mutator: () => void,
  options: FlipOptions = {}
): Promise<void> {
  const first = recordPositions(container);
  mutator();
  // Wait a microtask for signal-driven DOM reconciliation to complete
  await new Promise(r => requestAnimationFrame(r));
  await animateFlip(first, options);
}
