import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { Component, signal, DIRECTIVE_DEF, ɵdir, getDirectiveDef } from '@angora-js/core';
import { renderComponent } from '@angora-js/testing';
import {
  FocusTrapDirective,
  AngoraDialogComponent,
  DialogService,
  DialogRef,
  AngoraTabGroupComponent,
  AngoraAccordionItemComponent,
  ToastService,
  AngoraToastContainerComponent,
  TooltipDirective,
  AngoraMenuComponent,
  AngoraMenuItemComponent,
  AngoraSelectComponent,
} from '../src/index.ts';

describe('@angora-js/ui - Angular-style UI Components & Directives', () => {
  let window: Window;
  let document: Document;

  beforeEach(() => {
    window = new Window();
    document = window.document as unknown as Document;
    (globalThis as any).document = document;
    (globalThis as any).window = window;
    (globalThis as any).Event = window.Event;
    (globalThis as any).KeyboardEvent = window.KeyboardEvent;
    (globalThis as any).MouseEvent = window.MouseEvent;
  });

  describe('FocusTrapDirective ([angoraFocusTrap])', () => {
    test('should have Angular Directive selector [angoraFocusTrap]', () => {
      const def = getDirectiveDef(FocusTrapDirective);
      expect(def).toBeDefined();
      expect(def?.metadata.selector).toBe('[angoraFocusTrap]');
      expect((FocusTrapDirective as any).ɵdir).toBeDefined();
    });
  });

  describe('AngoraDialogComponent (<angora-dialog>)', () => {
    test('should control open/close state, backdrop, and Escape key', () => {
      const fixture = renderComponent(AngoraDialogComponent);
      const comp = fixture.componentInstance;

      let emittedOpen: any = null;
      comp.openChange.subscribe(val => {
        emittedOpen = val;
      });

      // Initially closed
      expect(comp.open()).toBe(false);
      let panel = fixture.debugElement.query('.angora-dialog-panel');
      expect(panel).toBeNull();

      // Open dialog
      comp.open.__set(true);
      panel = fixture.debugElement.query('.angora-dialog-panel');
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute('role')).toBe('dialog');
      expect(panel?.getAttribute('aria-modal')).toBe('true');

      // Call show()
      comp.show();
      expect(emittedOpen).toBe(true);

      // Call close()
      comp.close();
      expect(emittedOpen).toBe(false);

      // ESC key trigger
      comp.handleKeyDown(new (window as any).KeyboardEvent('keydown', { key: 'Escape' }));
      expect(emittedOpen).toBe(false);
    });

    test('should open dialog dynamically via DialogService (MatDialog equivalent)', () => {
      @Component({
        selector: 'confirm-dialog',
        template: `<div class="confirm-box">Are you sure?</div>`,
      })
      class ConfirmDialogComponent {}

      const dialogService = new DialogService();
      const dialogRef = dialogService.open(ConfirmDialogComponent, {
        data: { message: 'Hello' },
      });

      expect(dialogRef).toBeInstanceOf(DialogRef);
      expect(dialogRef.componentInstance).toBeInstanceOf(ConfirmDialogComponent);
      expect(document.body.querySelector('.confirm-box')?.textContent).toBe('Are you sure?');

      let closedResult: any = null;
      dialogRef.afterClosed; // signal

      dialogRef.close('confirmed_ok');
      expect(dialogRef.afterClosed()).toBe('confirmed_ok');
      expect(document.body.querySelector('.confirm-box')).toBeNull();
    });
  });

  describe('AngoraTabGroupComponent (<angora-tab-group>)', () => {
    test('should manage tabs and handle keyboard navigation', () => {
      const fixture = renderComponent(AngoraTabGroupComponent);
      const tabGroup = fixture.componentInstance;

      tabGroup.setLabels(['Overview', 'Security', 'Billing']);

      let selectedTab = 0;
      tabGroup.selectedIndexChange.subscribe(idx => {
        selectedTab = idx;
      });

      const header = fixture.debugElement.query('.angora-tab-header');
      expect(header).not.toBeNull();
      expect(header?.getAttribute('role')).toBe('tablist');

      const tabs = fixture.debugElement.queryAll('[role="tab"]');
      expect(tabs.length).toBe(3);
      expect(tabs[0].textContent).toBe('Overview');
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');

      // Click second tab
      tabs[1].click();
      expect(selectedTab).toBe(1);

      // Keyboard arrow navigation
      tabGroup.handleKeyDown(new (window as any).KeyboardEvent('keydown', { key: 'ArrowRight' }));
      expect(selectedTab).toBe(1);
    });
  });

  describe('AngoraAccordionItemComponent (<angora-accordion-item>)', () => {
    test('should toggle expanded state and reflect aria-expanded', () => {
      const fixture = renderComponent(AngoraAccordionItemComponent);
      const item = fixture.componentInstance;

      let expandedResult: any = null;
      item.expandedChange.subscribe(val => {
        expandedResult = val;
      });

      expect(item.expanded()).toBe(false);

      item.toggle();
      expect(expandedResult).toBe(true);

      item.expand();
      expect(expandedResult).toBe(true);

      item.collapse();
      expect(expandedResult).toBe(false);
    });
  });

  describe('ToastService', () => {
    test('should push notifications, track active toasts signal, and dismiss', () => {
      const toastService = new ToastService();
      expect(toastService.toasts()).toEqual([]);

      const id1 = toastService.info('Information message', 0);
      expect(toastService.toasts().length).toBe(1);
      expect(toastService.toasts()[0].message).toBe('Information message');
      expect(toastService.toasts()[0].type).toBe('info');

      const id2 = toastService.success('Action succeeded', 0);
      expect(toastService.toasts().length).toBe(2);

      toastService.dismiss(id1);
      expect(toastService.toasts().length).toBe(1);
      expect(toastService.toasts()[0].id).toBe(id2);

      toastService.clear();
      expect(toastService.toasts().length).toBe(0);
    });
  });

  describe('TooltipDirective ([angoraTooltip])', () => {
    test('should have Angular Directive selector [angoraTooltip]', () => {
      const def = getDirectiveDef(TooltipDirective);
      expect(def).toBeDefined();
      expect(def?.metadata.selector).toBe('[angoraTooltip]');
      expect((TooltipDirective as any).ɵdir).toBeDefined();
    });
  });

  describe('AngoraMenuComponent (<angora-menu>)', () => {
    test('should toggle dropdown open state and close on Escape', () => {
      const fixture = renderComponent(AngoraMenuComponent);
      const menu = fixture.componentInstance;

      expect(menu.open()).toBe(false);

      menu.toggle();
      expect(menu.open()).toBe(true);

      menu.handleKeyDown(new (window as any).KeyboardEvent('keydown', { key: 'Escape' }));
      expect(menu.open()).toBe(false);
    });
  });

  describe('AngoraSelectComponent (<angora-select>)', () => {
    test('should select options and compute selected label', () => {
      const fixture = renderComponent(AngoraSelectComponent);
      const select = fixture.componentInstance;

      const options = [
        { label: 'Option 1', value: 'opt1' },
        { label: 'Option 2', value: 'opt2' },
      ];
      select.options.__set(options);

      let emittedValue: any = null;
      select.valueChange.subscribe(val => {
        emittedValue = val;
      });

      expect(select.selectedLabel()).toBe('Select an option');
      expect(select.isOpen()).toBe(false);

      select.toggle();
      expect(select.isOpen()).toBe(true);

      // Select option 2
      select.select(options[1]);
      expect(emittedValue).toBe('opt2');
      expect(select.isOpen()).toBe(false);

      select.value.__set('opt2');
      expect(select.selectedLabel()).toBe('Option 2');
    });
  });

  describe('AngoraToastContainerComponent (<angora-toast-container>)', () => {
    test('should render active toasts from ToastService and dismiss on close button click', () => {
      const fixture = renderComponent(AngoraToastContainerComponent);
      const containerComp = fixture.componentInstance;
      containerComp.toastService.clear();

      // Initially no toasts rendered
      expect(fixture.debugElement.query('.angora-toast-container')).toBeNull();

      // Show toast
      containerComp.toastService.success('Profile updated successfully!', 0);

      // Verify DOM rendering
      const toastEl = fixture.debugElement.query('.angora-toast-item');
      expect(toastEl).not.toBeNull();
      expect(toastEl?.textContent).toContain('Profile updated successfully!');
      expect(toastEl?.classList.contains('angora-toast-item--success')).toBe(true);

      // Click close button
      const closeBtn = fixture.debugElement.query('.angora-toast-close');
      expect(closeBtn).not.toBeNull();
      closeBtn?.click();

      expect(containerComp.toastService.toasts().length).toBe(0);
      expect(fixture.debugElement.query('.angora-toast-container')).toBeNull();
    });
  });
});
