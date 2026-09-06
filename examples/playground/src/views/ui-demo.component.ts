import {
  Component,
  Directive,
  Pipe,
  type PipeTransform,
  ElementRef,
  signal,
  inject,
  UpperCasePipe,
  CurrencyPipe,
} from '@angora-js/core';
import {
  AngoraDialogComponent,
  AngoraSelectComponent,
  AngoraMenuComponent,
  AngoraMenuItemComponent,
  AngoraTabGroupComponent,
  AngoraAccordionComponent,
  AngoraAccordionItemComponent,
  ToastService,
} from '@angora-js/ui';

@Directive({
  selector: '[appHighlight]',
  host: {
    '[style.backgroundColor]': 'bgColor()',
    '[style.transition]': "'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'",
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()',
  },
})
export class AppHighlightDirective {
  bgColor = signal('transparent');

  onMouseEnter() {
    this.bgColor.set('rgba(99, 102, 241, 0.12)');
  }

  onMouseLeave() {
    this.bgColor.set('transparent');
  }
}

@Directive({
  selector: '[appPulse]',
  host: {
    '[style.transform]': 'scale()',
    '[style.transition]': "'transform 0.15s ease'",
    '(mousedown)': 'onMouseDown()',
    '(mouseup)': 'onMouseUp()',
  },
})
export class AppPulseDirective {
  scale = signal('scale(1)');

  onMouseDown() {
    this.scale.set('scale(0.96)');
  }

  onMouseUp() {
    this.scale.set('scale(1)');
  }
}

@Pipe({ name: 'mask', pure: true })
export class MaskPipe implements PipeTransform {
  transform(value: string | number, visibleChars = 4): string {
    if (!value) return '';
    const str = String(value);
    if (str.length <= visibleChars) return str;
    const masked = '•'.repeat(Math.max(0, str.length - visibleChars));
    return masked + str.slice(-visibleChars);
  }
}

@Pipe({ name: 'reverse', pure: true })
export class ReversePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    return String(value).split('').reverse().join('');
  }
}

@Component({
  selector: 'app-ui-demo',
  imports: [
    AngoraDialogComponent,
    AngoraSelectComponent,
    AngoraMenuComponent,
    AngoraMenuItemComponent,
    AngoraTabGroupComponent,
    AngoraAccordionComponent,
    AngoraAccordionItemComponent,
    AppHighlightDirective,
    AppPulseDirective,
    MaskPipe,
    ReversePipe,
    UpperCasePipe,
    CurrencyPipe,
  ],
  template: `
    <div class="ui-demo-view">
      <!-- Section Header -->
      <div
        class="panel-card"
        style="background: linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(79,70,229,0.08) 100%);"
      >
        <h1 style="margin: 0 0 0.5rem 0; font-size: 1.75rem; color: var(--angora-primary);">
          🎨 Enterprise Accessible UI Suite & SCSS Tokens
        </h1>
        <p style="margin: 0; color: var(--angora-text-secondary); line-height: 1.6;">
          Pre-built WAI-ARIA compliant components engineered with our SCSS token & mixin
          architecture. Fully reactive, customizable, and zero external widget dependencies.
        </p>
      </div>

      <!-- Toast Service Interactive Bar -->
      <div class="panel-card">
        <h3 style="margin-top: 0;">Global Toast Notifications (ToastService)</h3>
        <p style="color: var(--angora-text-secondary); font-size: 0.875rem;">
          Trigger reactive toasts rendered in the global <code>&lt;angora-toast-container&gt;</code>
        </p>
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
          <button class="btn btn-primary" (click)="triggerToast('success')">
            🎉 Show Success Toast
          </button>
          <button class="btn btn-secondary" (click)="triggerToast('info')">
            ℹ️ Show Info Toast
          </button>
          <button
            class="btn btn-secondary"
            style="border-color: #f59e0b; color: #b45309;"
            (click)="triggerToast('warning')"
          >
            ⚠️ Show Warning Toast
          </button>
          <button class="btn btn-danger" (click)="triggerToast('error')">
            🚨 Show Error Toast
          </button>
        </div>
      </div>

      <!-- Grid of Components: Dialog, Select, Menu -->
      <div class="grid-2">
        <!-- Dialog & Modal -->
        <div class="panel-card">
          <h3 style="margin-top: 0;">Accessible Modal (angora-dialog)</h3>
          <p style="color: var(--angora-text-secondary); font-size: 0.875rem;">
            WAI-ARIA <code>role="dialog"</code> modal with backdrop click and Escape key dismissal.
          </p>
          <button class="btn btn-primary" (click)="openDialog()">Launch Interactive Dialog</button>

          <angora-dialog [open]="isDialogOpen()" (openChange)="isDialogOpen.set($event)">
            <div style="max-width: 420px;">
              <h2 style="margin-top: 0; color: var(--angora-primary);">✨ Angora Design Dialog</h2>
              <p style="color: var(--angora-text-secondary); line-height: 1.5;">
                This modal is dynamically mounted and responds to native keyboard events (Escape),
                backdrop dismissal, and reactive parent signals.
              </p>
              <div
                style="background: var(--angora-surface-muted); padding: 1rem; border-radius: 8px; margin: 1rem 0;"
              >
                <strong>Selected Framework:</strong> {{ selectedFramework() }}
              </div>
              <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                <button class="btn btn-secondary" (click)="closeDialog()">Cancel</button>
                <button class="btn btn-primary" (click)="confirmDialog()">Confirm Action</button>
              </div>
            </div>
          </angora-dialog>
        </div>

        <!-- Select & Menu -->
        <div class="panel-card">
          <h3 style="margin-top: 0;">Custom Select & Dropdown Menu</h3>

          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label class="form-label">Enterprise Architecture Select:</label>
            <angora-select
              [options]="frameworkOptions"
              [value]="selectedFramework()"
              (valueChange)="selectedFramework.set($event)"
            >
            </angora-select>
            <span class="form-hint"
              >Selected Value: <strong>{{ selectedFramework() }}</strong></span
            >
          </div>

          <div
            style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--angora-border-color); padding-top: 1rem;"
          >
            <div>
              <span class="form-label">Actions Context Menu:</span>
              <p style="margin: 0; font-size: 0.75rem; color: var(--angora-text-secondary);">
                Click trigger to open
              </p>
            </div>

            <angora-menu>
              <button class="btn btn-secondary" menuTrigger>⚙️ Menu Options ▾</button>
              <angora-menu-item (itemClick)="handleMenuAction('Export PDF')"
                >📄 Export Report (PDF)</angora-menu-item
              >
              <angora-menu-item (itemClick)="handleMenuAction('Sync Database')"
                >🔄 Sync Database</angora-menu-item
              >
              <angora-menu-item (itemClick)="handleMenuAction('Archive Workspace')"
                >📦 Archive Workspace</angora-menu-item
              >
            </angora-menu>
          </div>
        </div>
      </div>

      <!-- Accordion & Documentation -->
      <div class="panel-card">
        <h3 style="margin-top: 0;">Collapsible Accordion (angora-accordion)</h3>
        <p style="color: var(--angora-text-secondary); font-size: 0.875rem;">
          Expandable sections styled with SCSS tokens and smooth transitions:
        </p>

        <angora-accordion>
          <angora-accordion-item
            title="1. Why is Angora faster than traditional Virtual DOM frameworks?"
            [expanded]="sec1Open()"
            (expandedChange)="sec1Open.set($event)"
          >
            <p style="margin: 0; line-height: 1.6; color: var(--angora-text-secondary);">
              Angora compiles templates directly into atomic DOM updates wired to fine-grained
              Signals. There is zero Virtual DOM tree allocation, zero diffing pass, and zero
              component re-rendering. Updates execute in O(1) time precisely at the target DOM node.
            </p>
          </angora-accordion-item>

          <angora-accordion-item
            title="2. How does the SCSS Design System support custom theme branding?"
            [expanded]="sec2Open()"
            (expandedChange)="sec2Open.set($event)"
          >
            <p style="margin: 0; line-height: 1.6; color: var(--angora-text-secondary);">
              Our SCSS architecture uses modern CSS Custom Properties coupled with Sass mixins and
              functions. Developers can override colors, radii, shadows, and spacing using
              <code>@include angora.theme(( 'primary': #... ))</code>, and seamlessly toggle between
              Light and Dark modes via <code>[data-theme=&quot;dark&quot;]</code>.
            </p>
          </angora-accordion-item>

          <angora-accordion-item
            title="3. How does Router 2.0 handle code-splitting and preloading?"
            [expanded]="sec3Open()"
            (expandedChange)="sec3Open.set($event)"
          >
            <p style="margin: 0; line-height: 1.6; color: var(--angora-text-secondary);">
              Router 2.0 natively supports <code>loadComponent</code> and
              <code>loadChildren</code> dynamic imports. Using <code>PreloadAllModules</code>, lazy
              routes are preloaded in the background via <code>requestIdleCallback</code>, giving
              users instant zero-latency transitions when they click links.
            </p>
          </angora-accordion-item>
        </angora-accordion>
      </div>

      <!-- Custom Directives & Pipe Showcase -->
      <div class="panel-card" style="margin-top: 1.5rem;">
        <h3 style="margin-top: 0; display: flex; align-items: center; gap: 0.5rem;">
          <span>⚡</span>
          <span>Enterprise Custom Directives & Reactive Pipes (@Directive & @Pipe)</span>
        </h3>
        <p
          style="color: var(--angora-text-secondary); font-size: 0.875rem; margin-bottom: 1.25rem;"
        >
          Native compilation via Rust engine. Zero JS runtime decorator overhead. Full bidirectional
          type-checking.
        </p>

        <div class="grid-2">
          <!-- Directives Demo -->
          <div
            style="background: var(--angora-surface-muted); padding: 1.25rem; border-radius: 8px;"
          >
            <h4 style="margin-top: 0; margin-bottom: 0.5rem;">🎯 Custom Directives in Action</h4>
            <p style="font-size: 0.8rem; color: var(--angora-text-secondary); margin-bottom: 1rem;">
              Hover or click the interactive cards below to trigger host bindings & listeners:
            </p>

            <div
              appHighlight
              appPulse
              style="padding: 1rem; border: 1px dashed var(--angora-border); border-radius: 6px; cursor: pointer; margin-bottom: 0.75rem;"
            >
              <strong>[appHighlight] + [appPulse]</strong>
              <div
                style="font-size: 0.85rem; color: var(--angora-text-secondary); margin-top: 0.25rem;"
              >
                Hover over me to tint background, click down to pulse-scale!
              </div>
            </div>

            <div
              appHighlight
              style="padding: 1rem; border: 1px dashed var(--angora-border); border-radius: 6px; cursor: pointer;"
            >
              <strong>[appHighlight] Only</strong>
              <div
                style="font-size: 0.85rem; color: var(--angora-text-secondary); margin-top: 0.25rem;"
              >
                Demonstrating multi-element reusable directive attachment.
              </div>
            </div>
          </div>

          <!-- Pipes Demo -->
          <div
            style="background: var(--angora-surface-muted); padding: 1.25rem; border-radius: 8px;"
          >
            <h4 style="margin-top: 0; margin-bottom: 0.5rem;">🪄 Data Transformation Pipes</h4>
            <p style="font-size: 0.8rem; color: var(--angora-text-secondary); margin-bottom: 1rem;">
              Built-in (uppercase, currency, date) and custom pure pipes (mask, reverse):
            </p>

            <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.875rem;">
              <div>
                <span style="color: var(--angora-text-secondary);">Raw Text:</span>
                <code>{{ sampleText() }}</code>
              </div>
              <div>
                <span style="color: var(--angora-text-secondary);">Uppercase Pipe:</span>
                <strong>{{ sampleText() | uppercase }}</strong>
              </div>
              <div>
                <span style="color: var(--angora-text-secondary);">Custom Reverse Pipe:</span>
                <span class="badge badge-info">{{ sampleText() | reverse }}</span>
              </div>
              <div>
                <span style="color: var(--angora-text-secondary);">Currency Pipe:</span>
                <strong style="color: #10b981;">{{
                  sampleAmount() | currency: 'USD' : true
                }}</strong>
              </div>
              <div>
                <span style="color: var(--angora-text-secondary);"
                  >Custom Mask Pipe (Account):</span
                >
                <code>{{ accountNumber() | mask: 4 }}</code>
              </div>
              <div>
                <span style="color: var(--angora-text-secondary);"
                  >Chained Pipes (mask | uppercase):</span
                >
                <code>{{ accountNumber() | mask: 4 | uppercase }}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class UiDemoComponent {
  toastService = inject(ToastService);

  sampleText = signal('Angora Framework 2.0');
  sampleAmount = signal(28450.5);
  accountNumber = signal('ANGORA-9876-5432-1099');

  isDialogOpen = signal(false);
  selectedFramework = signal('Angora 2.0');

  sec1Open = signal(true);
  sec2Open = signal(false);
  sec3Open = signal(false);

  frameworkOptions = [
    { label: '🐾 Angora 2.0 (Signals + Zero VDOM)', value: 'Angora 2.0' },
    { label: '🅰️ Angular 19+ (Zoneless + Signals)', value: 'Angular 19+' },
    { label: '⚡ SolidJS (Reactive Signals)', value: 'SolidJS' },
    { label: '⚛️ React 19 (Compiler + Hooks)', value: 'React 19' },
  ];

  triggerToast(type: 'success' | 'info' | 'warning' | 'error') {
    switch (type) {
      case 'success':
        this.toastService.success('Profile preferences saved to cloud storage!', 4000);
        break;
      case 'info':
        this.toastService.info('Angora SCSS theme tokens recompiled dynamically.', 3500);
        break;
      case 'warning':
        this.toastService.warning('Background sync delayed by 200ms.', 3500);
        break;
      case 'error':
        this.toastService.error('Connection timeout to external replica server.', 5000);
        break;
    }
  }

  openDialog() {
    this.isDialogOpen.set(true);
  }

  closeDialog() {
    this.isDialogOpen.set(false);
  }

  confirmDialog() {
    this.isDialogOpen.set(false);
    this.toastService.success(`Confirmed settings for ${this.selectedFramework()}!`);
  }

  handleMenuAction(action: string) {
    this.toastService.info(`Executed menu action: "${action}"`);
  }
}
