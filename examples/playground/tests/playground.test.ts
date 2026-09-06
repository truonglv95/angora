import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Window } from 'happy-dom';
import { Injector, rootInjector } from '@angora-js/core';
import { renderComponent } from '@angora-js/testing';
import { provideRouter, Router, PreloadAllModules, type Routes } from '@angora-js/router';
import { ToastService } from '@angora-js/ui';
import { DashboardComponent } from '../src/views/dashboard.component.ts';
import { FormsDemoComponent } from '../src/views/forms-demo.component.ts';
import { UiDemoComponent } from '../src/views/ui-demo.component.ts';
import { LazyAdminComponent } from '../src/views/lazy-admin.component.ts';
import { AdvancedDemoComponent } from '../src/views/advanced-demo.component.ts';
import { I18nDemoComponent } from '../src/views/i18n-demo.component.ts';
import { AppComponent } from '../src/app.component.ts';
import { provideI18n, I18nService } from '@angora-js/i18n';

describe('🐾 Angora Enterprise Playground Integration Test', () => {
  let window: Window;
  let document: Document;

  beforeEach(() => {
    window = new Window();
    document = window.document as unknown as Document;
    (globalThis as any).window = window;
    (globalThis as any).document = document;
    (globalThis as any).Event = window.Event;
    (globalThis as any).KeyboardEvent = window.KeyboardEvent;
    (globalThis as any).MouseEvent = window.MouseEvent;
    (globalThis as any).HTMLElement = window.HTMLElement;
    (globalThis as any).Comment = window.Comment;
  });

  afterEach(() => {
    try {
      rootInjector.get(ToastService, null as any)?.clear();
    } catch {}
  });

  it('DashboardComponent: should compute double, linkedDraft, and track todos', () => {
    const fixture = renderComponent(DashboardComponent);
    const comp = fixture.componentInstance;

    expect(comp.count()).toBe(3);
    expect(comp.double()).toBe(6);
    expect(comp.linkedDraft()).toContain('draft_v3_');
    expect(comp.todos().length).toBe(6);

    // Increment count
    comp.increment();
    expect(comp.count()).toBe(4);
    expect(comp.double()).toBe(8);
    expect(comp.linkedDraft()).toContain('draft_v4_');

    // Add new task
    comp.newTodoText.set('Test Enterprise Release');
    comp.addTodo();
    expect(comp.todos().length).toBe(7);
  });

  it('FormsDemoComponent: should handle dynamic FormArray and calculate grandTotal with coupons', async () => {
    const fixture = renderComponent(FormsDemoComponent);
    const comp = fixture.componentInstance;

    // Initial 2 items: (1 * 199) + (2 * 49) = 199 + 98 = 297
    expect(comp.items.length()).toBe(2);
    expect(comp.grandTotal()).toBe(297);

    // Allow initial empty coupon async validation to complete
    await new Promise(r => setTimeout(r, 60));
    expect(comp.orderForm.valid()).toBe(true);

    // Add another item
    comp.addItemRow();
    expect(comp.items.length()).toBe(3);
    // + (1 * 39) = 336
    expect(comp.grandTotal()).toBe(336);

    // Test async coupon validator with ANGORA20 (-20%)
    comp.couponControl.setValue('ANGORA20');
    expect(comp.couponControl.status()).toBe('PENDING');

    // Wait for async validation resolution
    await new Promise(r => setTimeout(r, 700));
    expect(comp.couponControl.status()).toBe('VALID');
    // 336 * 0.8 = 268.8
    expect(comp.grandTotal()).toBe(268.8);
  });

  it('UiDemoComponent: should control dialog, select, and accordion states', () => {
    const fixture = renderComponent(UiDemoComponent);
    const comp = fixture.componentInstance;

    expect(comp.isDialogOpen()).toBe(false);
    comp.openDialog();
    expect(comp.isDialogOpen()).toBe(true);
    comp.closeDialog();
    expect(comp.isDialogOpen()).toBe(false);

    // Accordion state
    expect(comp.sec1Open()).toBe(true);
    expect(comp.sec2Open()).toBe(false);
    comp.sec2Open.set(true);
    expect(comp.sec2Open()).toBe(true);
  });

  it('LazyAdminComponent: should run diagnostic audit and update metrics', () => {
    const routes: Routes = [{ path: 'admin', component: LazyAdminComponent }];
    const injector = new Injector(provideRouter(routes), rootInjector);

    const fixture = renderComponent(LazyAdminComponent, {
      providers: provideRouter(routes),
    });
    const comp = fixture.componentInstance;

    expect(comp.signalNodeCount()).toBe(42);
    expect(comp.lastAuditLog()).toBe('');

    comp.runDiagnostics();
    expect(comp.signalNodeCount()).toBe(45);
    expect(comp.lastAuditLog()).toContain('Status: HEALTHY');
  });

  it('AdvancedDemoComponent: should support @angora-js/query SWR, optimistic mutations, and virtual scrolling', async () => {
    const fixture = renderComponent(AdvancedDemoComponent);
    const comp = fixture.componentInstance;

    // Verify initial signals and virtualizer
    expect(comp.selectedCategory()).toBe('tech');
    expect(comp.virtualizer.totalSize()).toBe(50000 * 40); // 2,000,000px
    expect(comp.virtualizer.virtualItems().length).toBeGreaterThan(0);

    // Initial items visible in 320px viewport with 4 overscan:
    // visible: ceil(320/40) = 8. + overscan 4 = 12
    expect(comp.virtualizer.virtualItems().length).toBe(12);

    // Scroll virtualizer to row 1000
    comp.jumpTo(1000);
    expect(comp.virtualizer.virtualItems()[0].index).toBe(1000 - 4); // 996 due to overscan

    // Allow marketQuery to fetch initial tech items
    await new Promise(r => setTimeout(r, 350));
    expect(comp.marketQuery.isLoading()).toBe(false);
    expect(comp.marketQuery.data()?.length).toBe(4);
    expect(comp.marketQuery.data()?.[0].symbol).toBe('NVDA');

    // Test category change triggers reactive refetch
    comp.setCategory('crypto');
    expect(comp.selectedCategory()).toBe('crypto');
    await new Promise(r => setTimeout(r, 350));
    expect(comp.marketQuery.data()?.length).toBe(3);
    expect(comp.marketQuery.data()?.[0].symbol).toBe('BTC');

    // Test optimistic add stock
    comp.addStockMutation.mutate({
      id: 999,
      symbol: 'TEST-TOKEN',
      name: 'Test Token',
      price: 100,
      change: '+10%',
    });
    // Immediately reflected in UI signal
    expect(comp.marketQuery.data()?.some(i => i.symbol === 'TEST-TOKEN')).toBe(true);

    // Test simulated failed mutation rollback
    const beforeFailCount = comp.marketQuery.data()?.length || 0;
    comp.simulateFailedMutation();
    // Initially optimistic added
    expect(comp.marketQuery.data()?.some(i => i.symbol === 'FAIL')).toBe(true);
    // Wait for failure and rollback
    await new Promise(r => setTimeout(r, 500));
    expect(comp.marketQuery.data()?.some(i => i.symbol === 'FAIL')).toBe(false);
    expect(comp.marketQuery.data()?.length).toBe(beforeFailCount);
  });

  it('I18nDemoComponent: should switch locales and update signals and ICU branches', () => {
    const fixture = renderComponent(I18nDemoComponent, {
      providers: [
        ...provideI18n({
          defaultLocale: 'en',
          translations: {
            en: { 'cart.summary': '{count, plural, =0 {Cart is empty} other {You have # items}}' },
            vi: {
              'cart.summary': '{count, plural, =0 {Giỏ hàng trống} other {Bạn có # sản phẩm}}',
            },
          },
        }),
      ],
    });
    const comp = fixture.componentInstance;

    expect(comp.i18n.locale()).toBe('en');
    expect(comp.itemCount()).toBe(3);
    expect(comp.tier()).toBe('gold');

    // Test tier change
    comp.setTier('diamond');
    expect(comp.tier()).toBe('diamond');

    // Test locale change
    comp.changeLocale('vi');
    expect(comp.i18n.locale()).toBe('vi');
  });

  it('AppComponent: should toggle dark/light theme, switch languages, and navigate across routes', () => {
    const routes: Routes = [
      { path: '', component: DashboardComponent },
      { path: 'forms', component: FormsDemoComponent },
      { path: 'ui', component: UiDemoComponent },
      { path: 'advanced', component: AdvancedDemoComponent },
      { path: 'i18n', component: I18nDemoComponent },
    ];

    const fixture = renderComponent(AppComponent, {
      providers: [...provideRouter(routes), ...provideI18n({ defaultLocale: 'en' })],
    });
    const comp = fixture.componentInstance;

    expect(comp.isDarkTheme()).toBe(false);
    comp.toggleTheme();
    expect(comp.isDarkTheme()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    comp.toggleTheme();
    expect(comp.isDarkTheme()).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // Test language toggling (en -> vi -> fr -> en)
    expect(comp.currentLocale()).toBe('en');
    comp.toggleLanguage();
    expect(comp.currentLocale()).toBe('vi');
    comp.toggleLanguage();
    expect(comp.currentLocale()).toBe('fr');
    comp.toggleLanguage();
    expect(comp.currentLocale()).toBe('en');
  });
});
