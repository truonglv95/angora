export interface ErrorBoundaryOptions {
  children: () => Node[];
  fallback: (error: any, retry: () => void) => Node[];
}

/**
 * Creates an ErrorBoundary anchor that catches errors in child components
 * and dynamically swaps in a fallback view with a retry callback
 */
export function createErrorBoundary(anchor: Comment, options: ErrorBoundaryOptions): () => void {
  let currentNodes: Node[] = [];
  let isDestroyed = false;

  function replaceNodes(newNodes: Node[]) {
    if (!anchor.parentNode || isDestroyed) return;
    for (const n of currentNodes) {
      if (n.parentNode) n.parentNode.removeChild(n);
    }
    currentNodes = newNodes;
    for (const n of currentNodes) {
      anchor.parentNode.insertBefore(n, anchor);
    }
  }

  const render = () => {
    try {
      const nodes = options.children();
      replaceNodes(nodes);
    } catch (err) {
      console.error('[Angora Error Boundary Captured]:', err);
      const fallbackNodes = options.fallback(err, render);
      replaceNodes(fallbackNodes);
    }
  };

  render();

  return () => {
    isDestroyed = true;
    for (const n of currentNodes) {
      if (n.parentNode) n.parentNode.removeChild(n);
    }
    currentNodes = [];
  };
}
