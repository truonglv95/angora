import { Injectable, signal, type WritableSignal } from '@angora-js/core';
import { formatIcuMessage } from './icu.ts';
import type { I18nConfig, TranslationParams } from './types.ts';

@Injectable({ providedIn: 'root' })
export class I18nService {
  public locale: WritableSignal<string>;
  public supportedLocales: WritableSignal<string[]>;

  private translationStore = new Map<string, Map<string, string>>();
  private missingHandler?: (key: string, locale: string) => string;
  private defaultLocale: string;

  constructor(config?: I18nConfig) {
    this.defaultLocale = config?.defaultLocale || 'en';
    this.locale = signal<string>(this.defaultLocale);
    this.supportedLocales = signal<string[]>(config?.supportedLocales || ['en']);
    this.missingHandler = config?.missingTranslationHandler;

    if (config?.translations) {
      for (const [loc, dict] of Object.entries(config.translations)) {
        this.loadTranslations(loc, dict);
      }
    }
  }

  /**
   * Switches the active application locale and triggers reactive re-render of all translated components.
   */
  setLocale(newLocale: string): void {
    if (this.locale() !== newLocale) {
      this.locale.set(newLocale);
    }
  }

  /**
   * Registers a dictionary of translations for a specific locale.
   */
  loadTranslations(locale: string, dict: Record<string, string>): void {
    let locMap = this.translationStore.get(locale);
    if (!locMap) {
      locMap = new Map<string, string>();
      this.translationStore.set(locale, locMap);
    }
    for (const [k, v] of Object.entries(dict)) {
      locMap.set(k, v);
    }
  }

  /**
   * Asynchronously loads translations on demand.
   */
  async loadTranslationsAsync(
    locale: string,
    loader: () => Promise<Record<string, string>>
  ): Promise<void> {
    const dict = await loader();
    this.loadTranslations(locale, dict);
  }

  /**
   * Translates a message key using fine-grained reactivity and ICU message formatting.
   */
  translate(key: string, params?: TranslationParams): string {
    const currentLoc = this.locale();
    let template = this.translationStore.get(currentLoc)?.get(key);

    if (template === undefined && currentLoc !== this.defaultLocale) {
      template = this.translationStore.get(this.defaultLocale)?.get(key);
    }

    if (template === undefined) {
      return this.missingHandler ? this.missingHandler(key, currentLoc) : key;
    }

    return formatIcuMessage(template, params, currentLoc);
  }

  /**
   * Shorthand alias for translate()
   */
  t(key: string, params?: TranslationParams): string {
    return this.translate(key, params);
  }

  /**
   * Formats a number according to the active locale.
   */
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    const loc = this.locale();
    return new Intl.NumberFormat(loc, options).format(value);
  }

  /**
   * Formats currency with active locale and currency symbol/code.
   */
  formatCurrency(
    value: number,
    currency: string = 'USD',
    options?: Intl.NumberFormatOptions
  ): string {
    const loc = this.locale();
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      ...options,
    }).format(value);
  }

  /**
   * Formats a date according to the active locale.
   */
  formatDate(
    date: Date | number | string,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
  ): string {
    const loc = this.locale();
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(loc, options).format(d);
  }

  /**
   * Formats relative time (e.g. "3 days ago").
   */
  formatRelativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions
  ): string {
    const loc = this.locale();
    return new Intl.RelativeTimeFormat(loc, { numeric: 'auto', ...options }).format(value, unit);
  }
}
