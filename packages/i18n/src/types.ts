export type TranslationParams = Record<string, any>;

export interface I18nConfig {
  defaultLocale?: string;
  supportedLocales?: string[];
  translations?: Record<string, Record<string, string>>;
  missingTranslationHandler?: (key: string, locale: string) => string;
}

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
