import { describe, it, expect } from 'bun:test';
import { Injector, rootInjector, runInInjectionContext } from '@angora-js/core';
import {
  I18nService,
  formatIcuMessage,
  provideI18n,
  TranslatePipe,
  I18nCurrencyPipe,
  I18nNumberPipe,
  I18nDatePipe,
} from '../src/index.ts';

describe('@angora-js/i18n - Enterprise Internationalization & ICU Formatting', () => {
  describe('ICU MessageFormat Engine', () => {
    it('should interpolate simple parameters', () => {
      const msg = 'Hello, {name}! You have {unread} messages.';
      const res = formatIcuMessage(msg, { name: 'Alice', unread: 5 });
      expect(res).toBe('Hello, Alice! You have 5 messages.');
    });

    it('should format ICU plurals with exact matches and category fallbacks', () => {
      const template = '{count, plural, =0 {No apples} =1 {One apple} other {# apples}}';

      expect(formatIcuMessage(template, { count: 0 })).toBe('No apples');
      expect(formatIcuMessage(template, { count: 1 })).toBe('One apple');
      expect(formatIcuMessage(template, { count: 42 })).toBe('42 apples');
    });

    it('should format ICU select statements', () => {
      const template =
        '{gender, select, male {He liked your post.} female {She liked your post.} other {They liked your post.}}';

      expect(formatIcuMessage(template, { gender: 'male' })).toBe('He liked your post.');
      expect(formatIcuMessage(template, { gender: 'female' })).toBe('She liked your post.');
      expect(formatIcuMessage(template, { gender: 'non-binary' })).toBe('They liked your post.');
    });

    it('should format nested ICU messages (select with plural)', () => {
      const template =
        '{gender, select, male {He has {count, plural, =0 {no items} other {# items}}.} other {They have {count, plural, =0 {no items} other {# items}}.}}';

      expect(formatIcuMessage(template, { gender: 'male', count: 3 })).toBe('He has 3 items.');
      expect(formatIcuMessage(template, { gender: 'other', count: 0 })).toBe('They have no items.');
    });
  });

  describe('I18nService', () => {
    it('should translate keys and react to locale changes', () => {
      const i18n = new I18nService({
        defaultLocale: 'en',
        translations: {
          en: {
            'nav.home': 'Home',
            'dashboard.welcome': 'Welcome back, {user}!',
          },
          vi: {
            'nav.home': 'Trang chủ',
            'dashboard.welcome': 'Chào mừng trở lại, {user}!',
          },
        },
      });

      expect(i18n.locale()).toBe('en');
      expect(i18n.t('nav.home')).toBe('Home');
      expect(i18n.t('dashboard.welcome', { user: 'Truong' })).toBe('Welcome back, Truong!');

      // Switch to Vietnamese
      i18n.setLocale('vi');
      expect(i18n.locale()).toBe('vi');
      expect(i18n.t('nav.home')).toBe('Trang chủ');
      expect(i18n.t('dashboard.welcome', { user: 'Truong' })).toBe('Chào mừng trở lại, Truong!');
    });

    it('should support async translation dictionary loading', async () => {
      const i18n = new I18nService({ defaultLocale: 'en' });

      await i18n.loadTranslationsAsync('fr', async () => {
        return {
          'btn.save': 'Enregistrer',
          'btn.cancel': 'Annuler',
        };
      });

      i18n.setLocale('fr');
      expect(i18n.t('btn.save')).toBe('Enregistrer');
      expect(i18n.t('btn.cancel')).toBe('Annuler');
    });

    it('should fallback to missing translation handler when key is absent', () => {
      const i18n = new I18nService({
        defaultLocale: 'en',
        missingTranslationHandler: (key, locale) => `[MISSING:${locale}:${key}]`,
      });

      expect(i18n.t('non.existent.key')).toBe('[MISSING:en:non.existent.key]');
    });

    it('should format numbers and currencies with Intl', () => {
      const i18n = new I18nService({ defaultLocale: 'en-US' });

      const numStr = i18n.formatNumber(1234567.89);
      expect(numStr).toContain('1,234,567.89');

      const currStr = i18n.formatCurrency(49.99, 'USD');
      expect(currStr).toContain('49.99');
      expect(currStr).toContain('$');

      i18n.setLocale('de-DE');
      const deNum = i18n.formatNumber(1234.5);
      expect(deNum).toContain('1.234,5');
    });
  });

  describe('Pipes and DI Integration', () => {
    it('should resolve through provideI18n and inject into TranslatePipe', () => {
      const providers = provideI18n({
        defaultLocale: 'en',
        translations: {
          en: { greet: 'Hello, {name}!' },
          vi: { greet: 'Xin chào, {name}!' },
        },
      });

      const injector = new Injector(providers, rootInjector);
      const i18n = injector.get(I18nService);
      expect(i18n).toBeDefined();

      const pipe = runInInjectionContext(injector, () => new TranslatePipe());
      expect(pipe.transform('greet', { name: 'Bob' })).toBe('Hello, Bob!');

      i18n.setLocale('vi');
      expect(pipe.transform('greet', { name: 'Bob' })).toBe('Xin chào, Bob!');
    });

    it('should format currency, number, and date via pipes', () => {
      const injector = new Injector(provideI18n({ defaultLocale: 'en-US' }), rootInjector);

      const currencyPipe = runInInjectionContext(injector, () => new I18nCurrencyPipe());
      const numberPipe = runInInjectionContext(injector, () => new I18nNumberPipe());
      const datePipe = runInInjectionContext(injector, () => new I18nDatePipe());

      expect(currencyPipe.transform(99.5, 'USD')).toContain('99.50');
      expect(numberPipe.transform(1000)).toContain('1,000');

      const testDate = new Date('2026-09-06T12:00:00Z');
      expect(datePipe.transform(testDate)).toBeDefined();
    });
  });
});
