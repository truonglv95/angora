import { Component, signal, inject } from '@angora-js/core';
import {
  I18nService,
  TranslatePipe,
  I18nNumberPipe,
  I18nCurrencyPipe,
  I18nDatePipe,
} from '@angora-js/i18n';
import { AngoraToastService } from '@angora-js/ui';

@Component({
  selector: 'app-i18n-demo',
  imports: [TranslatePipe, I18nNumberPipe, I18nCurrencyPipe, I18nDatePipe],
  template: `
    <div style="max-width: 1000px; margin: 0 auto; padding-bottom: 3rem;">
      <div style="margin-bottom: 2rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <span class="badge badge-info" style="font-size: 0.85rem;">Signal-Driven i18n</span>
          <span class="badge badge-success" style="font-size: 0.85rem;">ICU MessageFormat</span>
          <span class="badge badge-warning" style="font-size: 0.85rem;">Zero-Flash Switching</span>
        </div>
        <h1 style="font-size: 2.25rem; font-weight: 800; margin: 0 0 0.5rem 0;">
          🌐 Enterprise Internationalization & Localization
        </h1>
        <p style="margin: 0; color: var(--angora-text-secondary); line-height: 1.6;">
          Fine-grained reactive localization powered by <strong>@angora-js/i18n</strong>. Supports
          ICU plurals, select branches, and locale-aware number/currency/date pipes that update
          instantly without full re-render.
        </p>
      </div>

      <!-- Language Selector Bar -->
      <div
        class="panel-card"
        style="margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;"
      >
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <strong>Select Application Locale:</strong>
          <div style="display: flex; gap: 0.5rem;">
            <button
              class="btn"
              [class.btn-primary]="i18n.locale() === 'en'"
              [class.btn-secondary]="i18n.locale() !== 'en'"
              (click)="changeLocale('en')"
            >
              🇺🇸 English (en)
            </button>
            <button
              class="btn"
              [class.btn-primary]="i18n.locale() === 'vi'"
              [class.btn-secondary]="i18n.locale() !== 'vi'"
              (click)="changeLocale('vi')"
            >
              🇻🇳 Tiếng Việt (vi)
            </button>
            <button
              class="btn"
              [class.btn-primary]="i18n.locale() === 'fr'"
              [class.btn-secondary]="i18n.locale() !== 'fr'"
              (click)="changeLocale('fr')"
            >
              🇫🇷 Français (fr)
            </button>
          </div>
        </div>
        <span class="badge badge-info">Active: {{ i18n.locale() }}</span>
      </div>

      <!-- Grid 2: Plurals & Select -->
      <div class="grid-2" style="margin-bottom: 1.5rem;">
        <!-- Card 1: ICU Plurals -->
        <div class="panel-card">
          <h3 style="margin: 0 0 1rem 0;">📦 ICU Pluralization Engine</h3>
          <p style="color: var(--angora-text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
            Adjust count to observe exact matches (<code>=0</code>, <code>=1</code>) and plural
            rules (<code>other</code>) in real time.
          </p>

          <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.25rem;">
            <label style="font-weight: 600;">Item Count: {{ itemCount() }}</label>
            <input
              type="range"
              min="0"
              max="25"
              [value]="String(itemCount())"
              (input)="updateItemCount($event)"
              style="flex: 1; cursor: pointer;"
            />
          </div>

          <div
            style="background: var(--angora-bg-secondary); border: 1px solid var(--angora-border-color); border-radius: 6px; padding: 1rem; font-size: 1.1rem; font-weight: 600; color: var(--angora-primary);"
          >
            {{ 'cart.summary' | translate: { count: itemCount() } }}
          </div>
        </div>

        <!-- Card 2: ICU Select Conditional -->
        <div class="panel-card">
          <h3 style="margin: 0 0 1rem 0;">👑 ICU Select Branches</h3>
          <p style="color: var(--angora-text-secondary); font-size: 0.9rem; margin-bottom: 1rem;">
            Switch membership tier to evaluate gender/membership select branches.
          </p>

          <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem;">
            <button
              class="btn"
              [class.btn-primary]="tier() === 'standard'"
              [class.btn-secondary]="tier() !== 'standard'"
              (click)="setTier('standard')"
            >
              Standard
            </button>
            <button
              class="btn"
              [class.btn-primary]="tier() === 'gold'"
              [class.btn-secondary]="tier() !== 'gold'"
              (click)="setTier('gold')"
            >
              Gold VIP
            </button>
            <button
              class="btn"
              [class.btn-primary]="tier() === 'diamond'"
              [class.btn-secondary]="tier() !== 'diamond'"
              (click)="setTier('diamond')"
            >
              Diamond
            </button>
          </div>

          <div
            style="background: var(--angora-bg-secondary); border: 1px solid var(--angora-border-color); border-radius: 6px; padding: 1rem; font-size: 1.1rem; font-weight: 600; color: var(--angora-primary);"
          >
            {{ 'user.tier' | translate: { tier: tier(), name: userName() } }}
          </div>
        </div>
      </div>

      <!-- Card 3: Formatted Data Pipes -->
      <div class="panel-card">
        <h3 style="margin: 0 0 1rem 0;">💱 Locale-Aware Number, Currency & Date Formatting</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr
              style="border-bottom: 2px solid var(--angora-border-color); background: var(--angora-bg-secondary);"
            >
              <th style="padding: 0.75rem 1rem;">Data Field</th>
              <th style="padding: 0.75rem 1rem;">Raw Input</th>
              <th style="padding: 0.75rem 1rem;">Locale-Aware Transformed Output</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid var(--angora-border-color);">
              <td style="padding: 0.75rem 1rem; font-weight: 600;">Order Total</td>
              <td style="padding: 0.75rem 1rem; font-family: monospace;">2499.95</td>
              <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--angora-success);">
                {{
                  2499.95
                    | i18nCurrency
                      : (i18n.locale() === 'vi' ? 'VND' : i18n.locale() === 'fr' ? 'EUR' : 'USD')
                }}
              </td>
            </tr>
            <tr style="border-bottom: 1px solid var(--angora-border-color);">
              <td style="padding: 0.75rem 1rem; font-weight: 600;">Platform Visitors</td>
              <td style="padding: 0.75rem 1rem; font-family: monospace;">1845920</td>
              <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--angora-primary);">
                {{ 1845920 | i18nNumber }}
              </td>
            </tr>
            <tr>
              <td style="padding: 0.75rem 1rem; font-weight: 600;">Generated Timestamp</td>
              <td style="padding: 0.75rem 1rem; font-family: monospace;">2026-09-06T12:00:00Z</td>
              <td style="padding: 0.75rem 1rem; font-weight: 600;">
                {{ currentDate | i18nDate: { dateStyle: 'full' } }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class I18nDemoComponent {
  i18n = inject(I18nService);
  toast = inject(AngoraToastService);

  itemCount = signal<number>(3);
  tier = signal<'standard' | 'gold' | 'diamond'>('gold');
  userName = signal<string>('Alex');
  currentDate = new Date('2026-09-06T12:00:00Z');

  updateItemCount(event: any) {
    this.itemCount.set(Number(event.target.value));
  }

  setTier(t: 'standard' | 'gold' | 'diamond') {
    this.tier.set(t);
  }

  changeLocale(loc: string) {
    this.i18n.setLocale(loc);
    this.toast.info(`Locale switched to "${loc}". All template pipes re-evaluated instantly!`);
  }
}
