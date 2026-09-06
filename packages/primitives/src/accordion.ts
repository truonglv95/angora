import { signal, type Signal } from '@angora-js/core';

export interface AccordionOptions {
  multiple?: boolean;
  defaultExpandedIds?: string[];
  onToggle?: (expandedIds: string[]) => void;
}

export interface AccordionController {
  expandedIds: Signal<string[]>;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  expand: (id: string) => void;
  collapse: (id: string) => void;
  getHeaderProps: (id: string) => Record<string, any>;
  getContentProps: (id: string) => Record<string, any>;
}

export function useAccordion(options: AccordionOptions = {}): AccordionController {
  const expandedIds = signal<string[]>(options.defaultExpandedIds ?? []);
  const multiple = options.multiple ?? false;

  const isExpanded = (id: string): boolean => {
    return expandedIds().includes(id);
  };

  const toggle = (id: string) => {
    const current = expandedIds();
    let next: string[];

    if (current.includes(id)) {
      next = current.filter(item => item !== id);
    } else {
      next = multiple ? [...current, id] : [id];
    }

    expandedIds.set(next);
    options.onToggle?.(next);
  };

  const expand = (id: string) => {
    const current = expandedIds();
    if (!current.includes(id)) {
      const next = multiple ? [...current, id] : [id];
      expandedIds.set(next);
      options.onToggle?.(next);
    }
  };

  const collapse = (id: string) => {
    const current = expandedIds();
    if (current.includes(id)) {
      const next = current.filter(item => item !== id);
      expandedIds.set(next);
      options.onToggle?.(next);
    }
  };

  const getHeaderProps = (id: string) => ({
    id: `accordion-header-${id}`,
    role: 'button',
    'aria-expanded': String(isExpanded(id)),
    'aria-controls': `accordion-content-${id}`,
    tabIndex: 0,
    onClick: () => toggle(id),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle(id);
      }
    },
  });

  const getContentProps = (id: string) => ({
    id: `accordion-content-${id}`,
    role: 'region',
    'aria-labelledby': `accordion-header-${id}`,
    hidden: !isExpanded(id),
  });

  return {
    expandedIds,
    isExpanded,
    toggle,
    expand,
    collapse,
    getHeaderProps,
    getContentProps,
  };
}
