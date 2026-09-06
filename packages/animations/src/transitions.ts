import type { AnimationOptions, TransitionDef } from './types.ts';

export interface FadeOptions extends AnimationOptions {}

export interface SlideOptions extends AnimationOptions {
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number | string;
}

export interface ScaleOptions extends AnimationOptions {
  startScale?: number;
}

function runKeyframes(
  el: HTMLElement,
  keyframes: Keyframe[],
  options: AnimationOptions
): Promise<void> {
  const duration = options.duration ?? 200;
  const easing = options.easing ?? 'ease-out';

  if (typeof el.animate === 'function') {
    const anim = el.animate(keyframes, {
      duration,
      easing,
      delay: options.delay ?? 0,
      fill: options.fill ?? 'forwards',
    });

    return anim.finished
      ? anim.finished.then(() => {})
      : new Promise<void>(resolve => {
          anim.onfinish = () => resolve();
        });
  }

  // Fallback
  return Promise.resolve();
}

/**
 * Creates a fade-in and fade-out transition definition
 */
export function fade(options: FadeOptions = {}): TransitionDef {
  return {
    enter: (el: HTMLElement) => runKeyframes(el, [{ opacity: 0 }, { opacity: 1 }], options),
    leave: (el: HTMLElement) => runKeyframes(el, [{ opacity: 1 }, { opacity: 0 }], options),
  };
}

/**
 * Creates a slide-in and slide-out transition definition
 */
export function slide(options: SlideOptions = {}): TransitionDef {
  const dir = options.direction ?? 'up';
  const dist = options.distance ?? '20px';

  let enterTranslate = 'translateY(20px)';
  let leaveTranslate = 'translateY(20px)';

  if (dir === 'up') {
    enterTranslate = `translateY(${dist})`;
    leaveTranslate = `translateY(-${dist})`;
  } else if (dir === 'down') {
    enterTranslate = `translateY(-${dist})`;
    leaveTranslate = `translateY(${dist})`;
  } else if (dir === 'left') {
    enterTranslate = `translateX(${dist})`;
    leaveTranslate = `translateX(-${dist})`;
  } else if (dir === 'right') {
    enterTranslate = `translateX(-${dist})`;
    leaveTranslate = `translateX(${dist})`;
  }

  return {
    enter: (el: HTMLElement) =>
      runKeyframes(
        el,
        [
          { opacity: 0, transform: enterTranslate },
          { opacity: 1, transform: 'none' },
        ],
        options
      ),
    leave: (el: HTMLElement) =>
      runKeyframes(
        el,
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: leaveTranslate },
        ],
        options
      ),
  };
}

/**
 * Creates a scale pop transition definition
 */
export function scale(options: ScaleOptions = {}): TransitionDef {
  const start = options.startScale ?? 0.85;
  return {
    enter: (el: HTMLElement) =>
      runKeyframes(
        el,
        [
          { opacity: 0, transform: `scale(${start})` },
          { opacity: 1, transform: 'scale(1)' },
        ],
        options
      ),
    leave: (el: HTMLElement) =>
      runKeyframes(
        el,
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: `scale(${start})` },
        ],
        options
      ),
  };
}

/**
 * Helper to execute enter transition on an element
 */
export async function animateEnter(el: HTMLElement, transition: TransitionDef): Promise<void> {
  if (transition.enter) {
    await transition.enter(el);
  }
}

/**
 * Helper to execute leave transition on an element before removing it from DOM
 */
export async function animateLeave(
  el: HTMLElement,
  transition: TransitionDef,
  onDone?: () => void
): Promise<void> {
  if (transition.leave) {
    await transition.leave(el);
  }
  if (onDone) {
    onDone();
  }
}
