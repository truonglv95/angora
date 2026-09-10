import { effect, signal, untrack, type Signal, type WritableSignal } from '@angora-js/core';

export type BlockRenderer = () => Node[];

export interface IfBranchDef {
  condition?: () => boolean;
  render: BlockRenderer;
}

/**
 * Modern Angular @if / @else if / @else control flow runtime block
 * Supports single condition + fallback OR multi-branch conditional chain
 */
export function createIf(
  anchor: Comment,
  conditionOrBranches: (() => boolean) | IfBranchDef[],
  renderThen?: BlockRenderer,
  renderElse?: BlockRenderer
): () => void {
  let currentNodes: Node[] = [];
  let previousActiveBranch = -1;

  const cleanupNodes = () => {
    for (const node of currentNodes) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    currentNodes = [];
  };

  // Normalize branches
  const branches: IfBranchDef[] = Array.isArray(conditionOrBranches)
    ? conditionOrBranches
    : [
        { condition: conditionOrBranches, render: renderThen! },
        ...(renderElse ? [{ condition: undefined, render: renderElse }] : []),
      ];

  const destroy = effect(() => {
    let activeBranchIndex = -1;

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      if (!branch.condition || Boolean(branch.condition())) {
        activeBranchIndex = i;
        break;
      }
    }

    if (activeBranchIndex === previousActiveBranch) {
      return;
    }
    if (previousActiveBranch === -1 && anchor.parentNode) {
      let next = anchor.nextSibling;
      while (next && !(next.nodeType === 8 && (next as Comment).nodeValue === '/angora:if')) {
        const toRemove = next;
        next = next.nextSibling;
        anchor.parentNode.removeChild(toRemove);
      }
      if (next && next.nodeType === 8 && (next as Comment).nodeValue === '/angora:if') {
        anchor.parentNode.removeChild(next);
      }
    }
    previousActiveBranch = activeBranchIndex;

    cleanupNodes();

    const parent = anchor.parentNode;
    if (!parent || activeBranchIndex === -1) return;

    currentNodes = untrack(() => branches[activeBranchIndex].render());

    // Insert new nodes after anchor comment
    let refNode: Node = anchor;
    for (const node of currentNodes) {
      parent.insertBefore(node, refNode.nextSibling);
      refNode = node;
    }
  });

  return () => {
    destroy();
    cleanupNodes();
  };
}

export interface SwitchCaseDef<T = any> {
  caseValue?: T | T[] | ((val: T) => boolean); // undefined for @default, array for multi-value, predicate fn
  render: BlockRenderer;
}

/**
 * Modern Angular @switch control flow runtime block
 * @example
 * createSwitch(anchor, () => status(), [
 *   { caseValue: ['active', 'in-progress'], render: () => [activeSpan] },
 *   { caseValue: 'pending', render: () => [pendingSpan] },
 *   { render: () => [defaultSpan] } // @default
 * ]);
 */
export function createSwitch<T = any>(
  anchor: Comment,
  exprGetter: () => T,
  cases: SwitchCaseDef<T>[]
): () => void {
  let currentNodes: Node[] = [];
  let previousMatchedIndex = -1;

  const cleanupNodes = () => {
    for (const node of currentNodes) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    currentNodes = [];
  };

  const destroy = effect(() => {
    const value = exprGetter();
    let matchedIndex = -1;
    let defaultIndex = -1;

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      if (c.caseValue !== undefined) {
        let isMatch = false;
        if (Array.isArray(c.caseValue)) {
          isMatch = c.caseValue.includes(value);
        } else if (typeof c.caseValue === 'function') {
          isMatch = (c.caseValue as any)(value);
        } else {
          isMatch = c.caseValue === value;
        }

        if (isMatch) {
          matchedIndex = i;
          break;
        }
      } else if (defaultIndex === -1) {
        defaultIndex = i;
      }
    }

    const finalIndex = matchedIndex !== -1 ? matchedIndex : defaultIndex;

    if (finalIndex === previousMatchedIndex) {
      return;
    }
    if (previousMatchedIndex === -1 && anchor.parentNode) {
      let next = anchor.nextSibling;
      while (next && !(next.nodeType === 8 && (next as Comment).nodeValue === '/angora:switch')) {
        const toRemove = next;
        next = next.nextSibling;
        anchor.parentNode.removeChild(toRemove);
      }
      if (next && next.nodeType === 8 && (next as Comment).nodeValue === '/angora:switch') {
        anchor.parentNode.removeChild(next);
      }
    }
    previousMatchedIndex = finalIndex;

    cleanupNodes();

    const parent = anchor.parentNode;
    if (!parent || finalIndex === -1) return;

    currentNodes = untrack(() => cases[finalIndex].render());

    let refNode: Node = anchor;
    for (const node of currentNodes) {
      parent.insertBefore(node, refNode.nextSibling);
      refNode = node;
    }
  });

  return () => {
    destroy();
    cleanupNodes();
  };
}

interface ItemRecord<T> {
  key: any;
  itemSignal: WritableSignal<T>;
  indexSignal: WritableSignal<number>;
  nodes: Node[];
}

/**
 * Modern Angular @for (...; track ...) control flow runtime block
 * Keyed reconciliation reusing DOM nodes efficiently
 */
export function createFor<T>(
  anchor: Comment,
  listGetter: () => T[],
  trackBy: (item: T, index: number) => any,
  renderItem: (item: () => T, index: () => number) => Node[],
  renderEmpty?: BlockRenderer
): () => void {
  let previousRecords = new Map<any, ItemRecord<T>>();
  let emptyNodes: Node[] = [];
  let isFirstRun = true;

  const cleanupEmpty = () => {
    for (const node of emptyNodes) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    emptyNodes = [];
  };

  const cleanupAll = () => {
    cleanupEmpty();
    for (const record of previousRecords.values()) {
      for (const node of record.nodes) {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    }
    previousRecords.clear();
  };

  const destroy = effect(() => {
    const list = listGetter() || [];
    const parent = anchor.parentNode;
    if (!parent) return;

    if (isFirstRun) {
      isFirstRun = false;
      let next = anchor.nextSibling;
      while (next && !(next.nodeType === 8 && (next as Comment).nodeValue === '/angora:for')) {
        const toRemove = next;
        next = next.nextSibling;
        parent.removeChild(toRemove);
      }
      if (next && next.nodeType === 8 && (next as Comment).nodeValue === '/angora:for') {
        parent.removeChild(next);
      }
    }

    if (list.length === 0) {
      cleanupAll();
      if (renderEmpty) {
        emptyNodes = untrack(() => renderEmpty!());
        let refNode: Node = anchor;
        for (const node of emptyNodes) {
          parent.insertBefore(node, refNode.nextSibling);
          refNode = node;
        }
      }
      return;
    }

    cleanupEmpty();

    const newRecords = new Map<any, ItemRecord<T>>();
    let refNode: Node = anchor;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const key = trackBy(item, i);

      let record = previousRecords.get(key);

      if (record) {
        // Reuse existing node and update signals
        record.itemSignal.set(item);
        record.indexSignal.set(i);
        previousRecords.delete(key);
      } else {
        // Create new item signals & render with reactive Proxy
        const itemSignal = signal(item);
        const indexSignal = signal(i);
        const itemProxy = new Proxy(itemSignal.asReadonly(), {
          get(target: any, prop: any) {
            if (prop === Symbol.toPrimitive) {
              return (hint: string) => (hint === 'number' ? Number(target()) : String(target()));
            }
            if (prop === 'toString') {
              return () => String(target());
            }
            if (prop === 'valueOf') {
              return () => target();
            }
            const current = target();
            return current ? current[prop] : undefined;
          },
        });
        const nodes = untrack(() => renderItem(itemProxy as any, indexSignal.asReadonly()));
        record = {
          key,
          itemSignal,
          indexSignal,
          nodes,
        };
      }

      newRecords.set(key, record);

      // Re-position nodes sequentially in DOM
      for (const node of record.nodes) {
        if (node.nextSibling !== refNode.nextSibling || node.parentNode !== parent) {
          parent.insertBefore(node, refNode.nextSibling);
        }
        refNode = node;
      }
    }

    // Remove obsolete records that no longer exist
    for (const record of previousRecords.values()) {
      for (const node of record.nodes) {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    }

    previousRecords = newRecords;
  });

  return () => {
    destroy();
    cleanupAll();
  };
}
