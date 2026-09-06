import { describe, test, expect } from 'bun:test';
import { createVirtualizer, usePopover, useCombobox, useAccordion } from '../src/index.ts';

describe('@angora-js/primitives - Headless UI & Virtual Scrolling Engine', () => {
  test('should virtualize 100,000 items with O(1) calculation and correct slice indexes', () => {
    const totalCount = 100_000;
    const itemHeight = 40;
    const viewportHeight = 400; // 400px / 40px = 10 visible items + 3 overscan

    const virtualizer = createVirtualizer({
      count: () => totalCount,
      itemHeight,
      viewportHeight: () => viewportHeight,
      overscan: 3,
    });

    // 1. Total size must be exact: 100,000 * 40 = 4,000,000px
    expect(virtualizer.totalSize()).toBe(4_000_000);

    // 2. Initial visible slice at scrollTop = 0
    expect(virtualizer.startIndex()).toBe(0);
    expect(virtualizer.endIndex()).toBe(13); // 10 visible + 3 overscan
    expect(virtualizer.virtualItems()).toHaveLength(13);
    expect(virtualizer.virtualItems()[0].index).toBe(0);
    expect(virtualizer.virtualItems()[0].start).toBe(0);

    // 3. Scroll to row 10,000 (offset = 400,000px)
    virtualizer.setScrollOffset(400_000);

    expect(virtualizer.startIndex()).toBe(9997); // 10,000 - 3 overscan
    expect(virtualizer.endIndex()).toBe(10013); // 10,000 + 10 + 3
    const items = virtualizer.virtualItems();
    expect(items.length).toBe(16);
    expect(items[0].index).toBe(9997);
    expect(items[0].start).toBe(9997 * 40);
  });

  test('should handle accessible popover open/close/toggle and escape key', () => {
    let changedTo: any = null;
    const popover = usePopover({
      onOpenChange: open => {
        changedTo = open;
      },
    });

    expect(popover.isOpen()).toBe(false);

    popover.open();
    expect(popover.isOpen()).toBe(true);
    expect(changedTo).toBe(true);

    const contentProps = popover.getContentProps();
    expect(contentProps.role).toBe('dialog');
    expect(contentProps['aria-hidden']).toBe('false');

    // Simulate Escape key
    contentProps.onKeyDown({ key: 'Escape' } as any);
    expect(popover.isOpen()).toBe(false);
    expect(changedTo).toBe(false);
  });

  test('should handle accessible combobox filtering and keyboard selection', () => {
    const fruits = ['Apple', 'Banana', 'Blueberry', 'Cherry', 'Date'];
    let selected: any = null;

    const combobox = useCombobox({
      items: () => fruits,
      onSelect: item => {
        selected = item;
      },
    });

    expect(combobox.filteredItems()).toHaveLength(5);

    // Type 'blu'
    const inputProps = combobox.getInputProps();
    inputProps.onInput({ target: { value: 'blu' } });

    expect(combobox.filteredItems()).toEqual(['Blueberry']);
    expect(combobox.isOpen()).toBe(true);

    // Press Enter to select
    inputProps.onKeyDown({ key: 'Enter', preventDefault: () => {} } as any);
    expect(selected).toBe('Blueberry');
    expect(combobox.isOpen()).toBe(false);
  });

  test('should handle single and multiple accordion expansion with ARIA attributes', () => {
    const singleAccordion = useAccordion({ multiple: false });
    singleAccordion.toggle('item-1');
    expect(singleAccordion.isExpanded('item-1')).toBe(true);

    singleAccordion.toggle('item-2');
    // In single mode, item-1 collapses when item-2 opens
    expect(singleAccordion.isExpanded('item-1')).toBe(false);
    expect(singleAccordion.isExpanded('item-2')).toBe(true);

    const multiAccordion = useAccordion({ multiple: true });
    multiAccordion.toggle('item-1');
    multiAccordion.toggle('item-2');
    // In multiple mode, both remain open
    expect(multiAccordion.isExpanded('item-1')).toBe(true);
    expect(multiAccordion.isExpanded('item-2')).toBe(true);

    const header = multiAccordion.getHeaderProps('item-1');
    expect(header['aria-expanded']).toBe('true');
    expect(header.role).toBe('button');

    const content = multiAccordion.getContentProps('item-1');
    expect(content.role).toBe('region');
    expect(content.hidden).toBe(false);
  });
});
