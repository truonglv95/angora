import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import {
  recordPositions,
  animateFlip,
  fade,
  slide,
  scale,
  animateEnter,
  animateLeave,
} from '../src/index.ts';

describe('@angora-js/animations - FLIP Animation & Micro-Transitions', () => {
  let window: Window;
  let document: Document;
  let container: HTMLElement;

  beforeEach(() => {
    window = new Window();
    document = window.document as unknown as Document;
    (globalThis as any).document = document;
    (globalThis as any).window = window;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  test('should record positions of elements', () => {
    const item1 = document.createElement('div');
    const item2 = document.createElement('div');
    container.appendChild(item1);
    container.appendChild(item2);

    // Mock getBoundingClientRect
    item1.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 50, right: 110, bottom: 70 }) as DOMRect;
    item2.getBoundingClientRect = () =>
      ({ left: 10, top: 80, width: 100, height: 50, right: 110, bottom: 130 }) as DOMRect;

    const positions = recordPositions(container);
    expect(positions.size).toBe(2);
    expect(positions.get(item1)?.top).toBe(20);
    expect(positions.get(item2)?.top).toBe(80);
  });

  test('should execute animateFlip using Web Animations API', async () => {
    const item = document.createElement('div');
    container.appendChild(item);

    // Initial position
    const firstPositions = new Map<HTMLElement, DOMRect>();
    firstPositions.set(item, {
      left: 10,
      top: 100,
      width: 100,
      height: 50,
      right: 110,
      bottom: 150,
    } as DOMRect);

    // After reorder, position moved up to top: 20
    item.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 50, right: 110, bottom: 70 }) as DOMRect;

    let animatedKeyframes: any[] = [];
    let animationDuration = 0;

    (item as any).animate = (keyframes: any[], options: any) => {
      animatedKeyframes = keyframes;
      animationDuration = options.duration;
      return {
        finished: Promise.resolve(),
      };
    };

    await animateFlip(firstPositions, { duration: 300 });

    expect(animationDuration).toBe(300);
    // Delta Y = 100 - 20 = 80px
    expect(animatedKeyframes[0].transform).toBe('translate(0px, 80px)');
    expect(animatedKeyframes[1].transform).toBe('translate(0px, 0px)');
  });

  test('should execute fade enter and leave transitions', async () => {
    const el = document.createElement('div');
    container.appendChild(el);

    let recordedKeyframes: any[] = [];
    (el as any).animate = (keyframes: any[]) => {
      recordedKeyframes = keyframes;
      return { finished: Promise.resolve() };
    };

    const transition = fade({ duration: 150 });
    await animateEnter(el, transition);

    expect(recordedKeyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);

    let leaveDone = false;
    await animateLeave(el, transition, () => {
      leaveDone = true;
    });

    expect(leaveDone).toBe(true);
    expect(recordedKeyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });

  test('should execute slide transition with directional transforms', async () => {
    const el = document.createElement('div');
    container.appendChild(el);

    let recordedKeyframes: any[] = [];
    (el as any).animate = (keyframes: any[]) => {
      recordedKeyframes = keyframes;
      return { finished: Promise.resolve() };
    };

    const slideDown = slide({ direction: 'down', distance: '30px', duration: 200 });
    await animateEnter(el, slideDown);

    expect(recordedKeyframes[0].transform).toBe('translateY(-30px)');
    expect(recordedKeyframes[1].transform).toBe('none');

    await animateLeave(el, slideDown);
    expect(recordedKeyframes[0].transform).toBe('none');
    expect(recordedKeyframes[1].transform).toBe('translateY(30px)');
  });

  test('should execute scale pop transition', async () => {
    const el = document.createElement('div');
    container.appendChild(el);

    let recordedKeyframes: any[] = [];
    (el as any).animate = (keyframes: any[]) => {
      recordedKeyframes = keyframes;
      return { finished: Promise.resolve() };
    };

    const pop = scale({ startScale: 0.8 });
    await animateEnter(el, pop);

    expect(recordedKeyframes[0].transform).toBe('scale(0.8)');
    expect(recordedKeyframes[1].transform).toBe('scale(1)');
  });
});
