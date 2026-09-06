import { Pipe, inject, type PipeTransform } from '@angora-js/core';
import { I18nService } from './i18n.service.ts';
import type { TranslationParams } from './types.ts';

/**
 * Translates a key with parameters and plural/select support.
 * @example
 * {{ 'welcome' | translate: { name: 'Alice' } }}
 * {{ 'cart.items' | translate: { count: totalItems() } }}
 */
@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(key: string, params?: TranslationParams): string {
    if (!key) return '';
    // Reading locale creates fine-grained signal dependency
    this.i18n.locale();
    return this.i18n.translate(key, params);
  }
}

/**
 * Formats a number with locale-aware decimal and grouping separators.
 * @example
 * {{ 1234567.89 | i18nNumber: '1.2-2' }}
 */
@Pipe({ name: 'i18nNumber', pure: false })
export class I18nNumberPipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(value: number | string, options?: Intl.NumberFormatOptions): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    this.i18n.locale();
    return this.i18n.formatNumber(num, options);
  }
}

/**
 * Formats currency with locale-aware symbols and formatting.
 * @example
 * {{ 49.99 | i18nCurrency: 'EUR' }}
 */
@Pipe({ name: 'i18nCurrency', pure: false })
export class I18nCurrencyPipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(
    value: number | string,
    currencyCode: string = 'USD',
    options?: Intl.NumberFormatOptions
  ): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    this.i18n.locale();
    return this.i18n.formatCurrency(num, currencyCode, options);
  }
}

/**
 * Formats dates according to the active locale.
 * @example
 * {{ orderDate | i18nDate: { dateStyle: 'full' } }}
 */
@Pipe({ name: 'i18nDate', pure: false })
export class I18nDatePipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
    if (!value) return '';
    this.i18n.locale();
    return this.i18n.formatDate(value, options);
  }
}
