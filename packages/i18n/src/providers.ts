import { InjectionToken, type Provider } from '@angora-js/core';
import { I18nService } from './i18n.service.ts';
import type { I18nConfig } from './types.ts';

export const I18N_CONFIG = new InjectionToken<I18nConfig>('I18N_CONFIG');

/**
 * Provides internationalization services and configuration for the application.
 * @example
 * bootstrapApplication(AppComponent, '#app', {
 *   providers: [
 *     provideI18n({
 *       defaultLocale: 'en',
 *       supportedLocales: ['en', 'vi', 'fr'],
 *       translations: {
 *         en: { welcome: 'Welcome, {name}!' },
 *         vi: { welcome: 'Chào mừng, {name}!' },
 *       },
 *     }),
 *   ],
 * });
 */
export function provideI18n(config: I18nConfig = {}): Provider[] {
  return [
    { provide: I18N_CONFIG, useValue: config },
    {
      provide: I18nService,
      useFactory: () => new I18nService(config),
    },
  ];
}
