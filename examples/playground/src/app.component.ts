import { Component, signal, computed, inject } from '@angora-js/core';
import { Router, RouterOutlet } from '@angora-js/router';
import { AngoraToastContainerComponent } from '@angora-js/ui';
import { I18nService } from '@angora-js/i18n';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AngoraToastContainerComponent],
  template: `
    <div class="app-layout">
      <!-- Top Animated Navigation Progress Bar -->
      @if (isNavigating()) {
        <div class="nav-loading-bar"></div>
      }

      <!-- Master Navigation Bar -->
      <nav class="navbar">
        <div class="brand">
          <span style="font-size: 1.5rem;">🐾</span>
          <span>Angora Framework</span>
          <span class="badge badge-info" style="margin-left: 0.5rem; font-size: 0.7rem;"
            >v2.0 Enterprise</span
          >
        </div>

        <div class="nav-links">
          <button [class.active]="currentPath() === '/'" (click)="navigate('/')">
            📊 Dashboard
          </button>
          <button [class.active]="currentPath() === '/forms'" (click)="navigate('/forms')">
            📋 Reactive Forms
          </button>
          <button
            [class.active]="currentPath() === '/timetravel'"
            (click)="navigate('/timetravel')"
          >
            ⏪ Time-Travel & DevTools
          </button>
          <button [class.active]="currentPath() === '/ui'" (click)="navigate('/ui')">
            🎨 UI Suite & SCSS
          </button>
          <button [class.active]="currentPath() === '/advanced'" (click)="navigate('/advanced')">
            ⚡ Query & Virtualizer
          </button>
          <button [class.active]="currentPath() === '/i18n'" (click)="navigate('/i18n')">
            🌐 i18n & ICU
          </button>
          <button [class.active]="currentPath() === '/admin'" (click)="navigate('/admin')">
            🛡️ Lazy Admin
          </button>
        </div>

        <div class="nav-actions">
          <button class="theme-btn" style="margin-right: 0.5rem;" (click)="toggleLanguage()">
            🌐 {{ currentLocale().toUpperCase() }}
          </button>
          <button class="theme-btn" (click)="toggleTheme()">
            @if (isDarkTheme()) {
              <span>☀️ Light Mode</span>
            } @else {
              <span>🌙 Dark Mode</span>
            }
          </button>
        </div>
      </nav>

      <!-- Main Routed View Outlet -->
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>

      <!-- Global Enterprise Toast Notification Container -->
      <angora-toast-container></angora-toast-container>

      <!-- Master Footer -->
      <footer class="app-footer">
        <div>
          🐾 <strong>Angora Framework</strong> — The Next-Generation Zero-Virtual-DOM Frontend
          Platform
        </div>
        <div class="tech-pills">
          <span class="badge badge-info">Fine-Grained Signals</span>
          <span class="badge badge-success">Zero VDOM</span>
          <span class="badge badge-info">Time-Travel Debugging</span>
          <span class="badge badge-success">Global Event Delegation</span>
          <span class="badge badge-info">SCSS Design Tokens</span>
          <span class="badge badge-warning">Native OXC / Rust</span>
          <span class="badge badge-success">Preloaded Router 2.0</span>
          <span class="badge badge-info">Reactive FormArray</span>
        </div>
      </footer>
    </div>
  `,
})
export class AppComponent {
  router = inject(Router);
  i18n = inject(I18nService, new I18nService());

  currentPath = computed(() => {
    const raw = this.router.url();
    return raw.split('?')[0].replace(/\/+$/, '') || '/';
  });

  currentLocale = computed(() => this.i18n.locale());

  isNavigating = computed(() => this.router.isNavigating());

  isDarkTheme = signal(
    typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') === 'dark'
      : false
  );

  navigate(path: string) {
    this.router.navigate(path);
  }

  toggleLanguage() {
    const current = this.i18n.locale();
    const next = current === 'en' ? 'vi' : current === 'vi' ? 'fr' : 'en';
    this.i18n.setLocale(next);
  }

  toggleTheme() {
    const next = !this.isDarkTheme();
    this.isDarkTheme.set(next);
    if (typeof document !== 'undefined') {
      const themeName = next ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', themeName);
    }
  }
}
