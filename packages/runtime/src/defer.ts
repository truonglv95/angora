import { effect } from '@angora-js/core';

export interface DeferTriggerConfig {
  type: 'idle' | 'viewport' | 'interaction' | 'hover' | 'timer' | 'when';
  param?: any;
  condition?: () => boolean;
}

export interface DeferRuntimeOptions {
  triggers: DeferTriggerConfig[];
  main: () => Node[];
  placeholder?: () => Node[];
  loading?: () => Node[];
  error?: () => Node[];
  placeholderMinimum?: number;
  loadingAfter?: number;
  loadingMinimum?: number;
}

/**
 * Creates a reactive, fine-grained deferrable view (@defer)
 * Supports on viewport, on idle, on interaction, on hover, on timer, and when condition
 */
export function createDefer(anchor: Comment, options: DeferRuntimeOptions): () => void {
  let isLoaded = false;
  let isDestroyed = false;
  let currentNodes: Node[] = [];
  const cleanups: (() => void)[] = [];

  function replaceNodes(newNodes: Node[]) {
    if (isDestroyed || !anchor.parentNode) return;
    for (const n of currentNodes) {
      if (n.parentNode) n.parentNode.removeChild(n);
    }
    currentNodes = newNodes;
    for (const n of currentNodes) {
      anchor.parentNode.insertBefore(n, anchor);
    }
  }

  // 1. Mount placeholder initially
  if (options.placeholder) {
    replaceNodes(options.placeholder());
  }

  const triggerLoad = () => {
    if (isLoaded || isDestroyed) return;
    isLoaded = true;

    // Clean up event listeners and observers
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;

    let loadingTimer: any = null;
    let loadingShown = false;

    if (options.loading) {
      const after = options.loadingAfter || 0;
      if (after > 0) {
        loadingTimer = setTimeout(() => {
          if (!isDestroyed && !isLoaded) {
            loadingShown = true;
            replaceNodes(options.loading!());
          }
        }, after);
      } else {
        loadingShown = true;
        replaceNodes(options.loading());
      }
    }

    try {
      const mainNodes = options.main();
      if (loadingTimer) clearTimeout(loadingTimer);

      const minLoading = loadingShown ? options.loadingMinimum || 0 : 0;
      if (minLoading > 0) {
        setTimeout(() => {
          if (!isDestroyed) replaceNodes(mainNodes);
        }, minLoading);
      } else {
        replaceNodes(mainNodes);
      }
    } catch (err) {
      if (loadingTimer) clearTimeout(loadingTimer);
      console.error('[Angora @defer Error]:', err);
      if (options.error) {
        replaceNodes(options.error());
      }
    }
  };

  // Setup triggers
  for (const trigger of options.triggers) {
    if (trigger.type === 'idle') {
      if (typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(triggerLoad);
        cleanups.push(() => cancelIdleCallback(id));
      } else {
        const id = setTimeout(triggerLoad, 1);
        cleanups.push(() => clearTimeout(id));
      }
    } else if (trigger.type === 'timer') {
      const ms = Number(trigger.param) || 0;
      const id = setTimeout(triggerLoad, ms);
      cleanups.push(() => clearTimeout(id));
    } else if (trigger.type === 'when') {
      if (typeof trigger.condition === 'function') {
        const stopEffect = effect(() => {
          if (trigger.condition!()) {
            triggerLoad();
          }
        });
        cleanups.push(stopEffect);
      }
    } else if (trigger.type === 'viewport') {
      if (typeof IntersectionObserver !== 'undefined') {
        const target = currentNodes[0] instanceof Element ? currentNodes[0] : anchor.parentElement;
        if (target) {
          const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                observer.disconnect();
                triggerLoad();
                break;
              }
            }
          });
          observer.observe(target);
          cleanups.push(() => observer.disconnect());
        } else {
          triggerLoad();
        }
      } else {
        triggerLoad();
      }
    } else if (trigger.type === 'interaction') {
      const target = currentNodes[0] instanceof Element ? currentNodes[0] : anchor.parentElement;
      if (target) {
        const onInteract = () => {
          target.removeEventListener('click', onInteract);
          target.removeEventListener('keydown', onInteract);
          triggerLoad();
        };
        target.addEventListener('click', onInteract);
        target.addEventListener('keydown', onInteract);
        cleanups.push(() => {
          target.removeEventListener('click', onInteract);
          target.removeEventListener('keydown', onInteract);
        });
      }
    } else if (trigger.type === 'hover') {
      const target = currentNodes[0] instanceof Element ? currentNodes[0] : anchor.parentElement;
      if (target) {
        const onHover = () => {
          target.removeEventListener('mouseenter', onHover);
          triggerLoad();
        };
        target.addEventListener('mouseenter', onHover);
        cleanups.push(() => target.removeEventListener('mouseenter', onHover));
      }
    }
  }

  // Default fallback trigger: idle
  if (options.triggers.length === 0) {
    const id = setTimeout(triggerLoad, 0);
    cleanups.push(() => clearTimeout(id));
  }

  return () => {
    isDestroyed = true;
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
    for (const n of currentNodes) {
      if (n.parentNode) n.parentNode.removeChild(n);
    }
    currentNodes.length = 0;
  };
}
