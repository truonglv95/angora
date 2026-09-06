import { signal, type Signal } from '@angora-js/core';

export interface PopoverOptions {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface PopoverController {
  isOpen: Signal<boolean>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  getTriggerProps: () => Record<string, any>;
  getContentProps: () => Record<string, any>;
}

export function usePopover(options: PopoverOptions = {}): PopoverController {
  const isOpen = signal<boolean>(options.defaultOpen ?? false);

  const open = () => {
    isOpen.set(true);
    options.onOpenChange?.(true);
  };

  const close = () => {
    isOpen.set(false);
    options.onOpenChange?.(false);
  };

  const toggle = () => {
    const next = !isOpen();
    isOpen.set(next);
    options.onOpenChange?.(next);
  };

  const getTriggerProps = () => ({
    'aria-haspopup': 'dialog',
    'aria-expanded': String(isOpen()),
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      toggle();
    },
  });

  const getContentProps = () => ({
    role: 'dialog',
    tabIndex: -1,
    'aria-hidden': String(!isOpen()),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    },
  });

  return {
    isOpen,
    open,
    close,
    toggle,
    getTriggerProps,
    getContentProps,
  };
}
