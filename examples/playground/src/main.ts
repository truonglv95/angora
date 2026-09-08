import './styles.scss';
import '@angora-js/devtools';
import { bootstrapApplication } from '@angora-js/runtime';
import { provideRouter, withViewTransitions, type Routes } from '@angora-js/router';
import { provideI18n } from '@angora-js/i18n';
import { AppComponent } from './app.component.ts';
import { DashboardComponent } from './views/dashboard.component.ts';
import { FormsDemoComponent } from './views/forms-demo.component.ts';
import { UiDemoComponent } from './views/ui-demo.component.ts';
import { AdvancedDemoComponent } from './views/advanced-demo.component.ts';
import { I18nDemoComponent } from './views/i18n-demo.component.ts';
import { TimeTravelDemoComponent } from './views/timetravel-demo.component.ts';
import { enableClickToSourceInspector } from '@angora-js/runtime';

// Enable Click-to-Source Inspector in development
enableClickToSourceInspector();

const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    title: 'Angora 2.0 - Reactive Dashboard',
  },
  {
    path: 'forms',
    component: FormsDemoComponent,
    title: 'Angora 2.0 - Reactive Forms & Dynamic FormArray',
  },
  {
    path: 'timetravel',
    component: TimeTravelDemoComponent,
    title: 'Angora 2.0 - Time-Travel & DevTools Visualizer',
  },
  {
    path: 'ui',
    component: UiDemoComponent,
    title: 'Angora 2.0 - Accessible UI Suite & SCSS Tokens',
  },
  {
    path: 'advanced',
    component: AdvancedDemoComponent,
    title: 'Angora 2.0 - Advanced SWR Data Layer & 50k Virtualizer',
  },
  {
    path: 'i18n',
    component: I18nDemoComponent,
    title: 'Angora 2.0 - Signal-Driven i18n & ICU MessageFormat',
  },
  {
    path: 'admin',
    loadComponent: () => import('./views/lazy-admin.component.ts').then(m => m.LazyAdminComponent),
    title: 'Angora 2.0 - Lazy Admin Console (Code Splitting)',
  },
  {
    path: '**',
    redirectTo: '',
  },
];

bootstrapApplication(AppComponent, '#app', {
  providers: [
    ...provideRouter(
      routes,
      {
        scrollPositionRestoration: 'top',
      },
      withViewTransitions()
    ),
    ...provideI18n({
      defaultLocale: 'en',
      supportedLocales: ['en', 'vi', 'fr'],
      translations: {
        en: {
          'cart.summary':
            '{count, plural, =0 {Cart is empty} =1 {You have 1 item in your cart} other {You have # items in your cart}}',
          'user.tier':
            '{tier, select, gold {⭐ {name} holds a Gold VIP Membership!} diamond {💎 {name} holds an Elite Diamond Tier!} other {{name} holds a Standard Membership.}}',
        },
        vi: {
          'cart.summary':
            '{count, plural, =0 {Giỏ hàng trống} other {Bạn có # sản phẩm trong giỏ hàng}}',
          'user.tier':
            '{tier, select, gold {⭐ {name} sở hữu gói Hội Viên Vàng VIP!} diamond {💎 {name} sở hữu gói Kim Cương Đẳng Cấp!} other {{name} sở hữu gói Thành Viên Tiêu Chuẩn.}}',
        },
        fr: {
          'cart.summary':
            '{count, plural, =0 {Votre panier est vide} =1 {Vous avez 1 article dans votre panier} other {Vous avez # articles dans votre panier}}',
          'user.tier':
            '{tier, select, gold {⭐ {name} possède un abonnement VIP Or !} diamond {💎 {name} possède un abonnement Diamant Elite !} other {{name} possède un abonnement Standard.}}',
        },
      },
    }),
  ],
});
