import { signal, computed, type Signal } from '@angora-js/core';

export interface ComboboxOptions<T> {
  items: () => T[];
  itemToString?: (item: T) => string;
  onSelect?: (item: T) => void;
  defaultSelectedItem?: T | null;
}

export interface ComboboxController<T> {
  query: Signal<string>;
  isOpen: Signal<boolean>;
  activeIndex: Signal<number>;
  selectedItem: Signal<T | null>;
  filteredItems: Signal<T[]>;
  getInputProps: () => Record<string, any>;
  getItemProps: (index: number, item: T) => Record<string, any>;
  selectItem: (item: T) => void;
  reset: () => void;
}

export function useCombobox<T>(options: ComboboxOptions<T>): ComboboxController<T> {
  const query = signal<string>('');
  const isOpen = signal<boolean>(false);
  const activeIndex = signal<number>(-1);
  const selectedItem = signal<T | null>(options.defaultSelectedItem ?? null);

  const itemToString = options.itemToString || ((item: T) => String(item));

  const filteredItems = computed(() => {
    const q = query().toLowerCase().trim();
    const all = options.items();
    if (!q) return all;
    return all.filter(item => itemToString(item).toLowerCase().includes(q));
  });

  const selectItem = (item: T) => {
    selectedItem.set(item);
    query.set(itemToString(item));
    isOpen.set(false);
    activeIndex.set(-1);
    options.onSelect?.(item);
  };

  const reset = () => {
    query.set('');
    selectedItem.set(null);
    activeIndex.set(-1);
    isOpen.set(false);
  };

  const getInputProps = () => ({
    role: 'combobox',
    'aria-expanded': String(isOpen()),
    'aria-autocomplete': 'list',
    'aria-haspopup': 'listbox',
    value: query(),
    onInput: (e: any) => {
      const val = e?.target?.value ?? '';
      query.set(val);
      isOpen.set(true);
      activeIndex.set(0);
    },
    onFocus: () => {
      isOpen.set(true);
    },
    onKeyDown: (e: KeyboardEvent) => {
      const list = filteredItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        isOpen.set(true);
        activeIndex.update(i => (i + 1 < list.length ? i + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        isOpen.set(true);
        activeIndex.update(i => (i - 1 >= 0 ? i - 1 : list.length - 1));
      } else if (e.key === 'Enter') {
        const idx = activeIndex();
        if (isOpen() && idx >= 0 && idx < list.length) {
          e.preventDefault();
          selectItem(list[idx]);
        }
      } else if (e.key === 'Escape') {
        isOpen.set(false);
      }
    },
  });

  const getItemProps = (index: number, item: T) => ({
    role: 'option',
    'aria-selected': String(activeIndex() === index),
    onClick: () => {
      selectItem(item);
    },
    onMouseEnter: () => {
      activeIndex.set(index);
    },
  });

  return {
    query,
    isOpen,
    activeIndex,
    selectedItem,
    filteredItems,
    getInputProps,
    getItemProps,
    selectItem,
    reset,
  };
}
