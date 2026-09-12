# 🚀 Migrating from Angular to Angora

This guide is designed for Angular developers transitioning to **Angora**. Angora retains the architectural ergonomics of Angular—such as standalone components, clean declarative templates, dependency injection, reactive forms, and routing—while eliminating the complexity, performance overheads, and build slowness of legacy frameworks.

---

## 🧭 Why Migrate?

| Feature                | Angular (v14–v19)                               | Angora (v0.2+)                                           |
| :--------------------- | :---------------------------------------------- | :------------------------------------------------------- |
| **Change Detection**   | Zone.js dirty checking or hybrid Zoneless       | **Pure Fine-Grained Signals (Zero Zone.js)**             |
| **DOM Engine**         | Incremental DOM (JS-heavy runtime)              | **Direct Template Cloning (`cloneNode`)**                |
| **Compiler**           | `ngtsc` / `@angular/compiler` (~3–8s per build) | **Native Rust OXC Compiler (<0.1ms per file)**           |
| **Dev Server & HMR**   | Webpack / Vite esbuild (often resets state)     | **Vite + Fine-Grained Signal State Preservation (<1ms)** |
| **Bundle Size (Core)** | ~35 KB – 50 KB (gzip)                           | **~5.5 KB (gzip)**                                       |
| **Forms**              | ReactiveFormsModule / Untyped or Typed          | **Strictly-Typed Signal Forms with zero boilerplate**    |

---

## ⚡ 1. Component Definition

In Angular:

```typescript
// Angular
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-counter',
  standalone: true,
  imports: [CommonModule],
  template: ` <button (click)="increment()">Count: {{ count() }}</button> `,
})
export class CounterComponent {
  count = signal(0);
  increment() {
    this.count.update(n => n + 1);
  }
}
```

In Angora:

```typescript
// Angora
import { Component, signal } from '@angora-js/core';

// 1. Selector is optional (auto-inferred as <app-counter> or <counter-component>)
// 2. imports: [...] is optional (Rust compiler auto-resolves imported components & pipes)
@Component({
  template: ` <button (click)="count.inc()">Count: {{ count() }}</button> `,
})
export class CounterComponent {
  // Built-in arithmetic ergonomics: count.inc(), count.dec(), count(newValue)
  count = signal(0);
}
```

---

## 🔄 2. State & Signals vs RxJS

While Angora provides full RxJS interoperability via [`@angora-js/rxjs-interop`](file:///Users/truong/Documents/product/angora/packages/rxjs-interop), you no longer need `BehaviorSubject` or the `| async` pipe for local component state:

| Angular (RxJS)                      | Angora (Signals)                             |
| :---------------------------------- | :------------------------------------------- |
| `count$ = new BehaviorSubject(0);`  | `count = signal(0);`                         |
| `this.count$.next(1);`              | `this.count.set(1);` or `this.count(1);`     |
| `this.count$.pipe(map(x => x * 2))` | `double = computed(() => this.count() * 2);` |
| `this.count$.subscribe(x => ...)`   | `effect(() => console.log(this.count()));`   |
| `{{ count$                          | async }}`                                    | `{{ count() }}` |

If you have existing RxJS Observables, bridge them cleanly:

```typescript
import { toSignal, toObservable } from '@angora-js/rxjs-interop';

// Convert Observable to Signal
const user = toSignal(userService.user$, { initialValue: null });

// Convert Signal to Observable
const count$ = toObservable(this.count);
```

---

## 🎨 3. Template Control Flow & Bindings

Angora implements modern control flow syntax:

### If / Else

```html
@if (isLoggedIn()) {
<p>Welcome back, {{ user().name }}!</p>
} @else if (isGuest()) {
<p>Welcome, Guest!</p>
} @else {
<p>Please log in.</p>
}
```

### For Loops with Track

```html
<ul>
  @for (item of items(); track item.id; let i = $index, isFirst = $first) {
  <li [class.first-item]="isFirst()">{{ i() }}: {{ item.name }}</li>
  } @empty {
  <li>No items found.</li>
  }
</ul>
```

### Switch Statements

```html
@switch (status()) { @case ('loading') { <spinner-component /> } @case ('success') {
<data-view [data]="data()" /> } @default { <error-alert /> } }
```

### Deferrable Views (`@defer`)

```html
@defer (on viewport; prefetch on idle) {
<heavy-chart [data]="chartData()" />
} @placeholder {
<div class="skeleton">Loading chart...</div>
} @loading (minimum 500ms) {
<spinner-component />
}
```

---

## 🤝 4. Two-Way Binding (`model()`)

Forget defining separate `@Input()` and `@Output()` pairs with `EventEmitter`:

```typescript
import { Component, model } from '@angora-js/core';

@Component({
  template: `
    <input [value]="query()" (input)="query.set($event.target.value)" />
    <button (click)="query.set('')">Clear</button>
  `,
})
export class SearchInput {
  // Exposes [query] input and (queryChange) output automatically!
  query = model('');
}
```

Usage in parent template:

```html
<search-input [(query)]="searchFilter" />
```

---

## 💉 5. Dependency Injection

Angora's DI system is fully compatible with Angular's hierarchical injector pattern:

```typescript
import { Injectable, inject } from '@angora-js/core';

@Injectable({ providedIn: 'root' })
export class UserService {
  getUser() {
    return { name: 'Alex' };
  }
}

@Component({
  template: `<h1>Hello, {{ user.name }}</h1>`,
})
export class UserProfile {
  // Concise constructor-less injection
  private userService = inject(UserService);
  user = this.userService.getUser();
}
```

---

## 🛣️ 6. Routing (Angular Router $\rightarrow$ `@angora-js/router`)

### Configuration

```typescript
import { bootstrapApplication } from '@angora-js/runtime';
import { provideRouter, withViewTransitions } from '@angora-js/router';
import { AppComponent } from './app.component.ts';

bootstrapApplication(AppComponent, '#app', {
  providers: [
    provideRouter(
      [
        { path: '', redirectTo: '/home', pathMatch: 'full' },
        {
          path: 'home',
          loadComponent: () => import('./home.component.ts').then(m => m.HomeComponent),
        },
        {
          path: 'admin',
          loadComponent: () => import('./admin.component.ts').then(m => m.AdminComponent),
          canActivate: [() => inject(AuthService).isAuthenticated()],
        },
      ],
      withViewTransitions() // Native View Transitions API
    ),
  ],
});
```

### Composable Hooks

Instead of injecting `ActivatedRoute`, use direct reactive signals:

```typescript
import { useRouter, useParams, useQueryParams, useRoute } from '@angora-js/router';

export class ProductDetails {
  private router = useRouter();
  params = useParams(); // Signal<Record<string, string>>
  queryParams = useQueryParams(); // Signal<Record<string, string>>

  goToCheckout() {
    this.router.navigate(['/checkout', this.params().id]);
  }
}
```

---

## 📋 7. Forms (Reactive Forms $\rightarrow$ `@angora-js/forms`)

Angora provides model-first, strictly-typed forms with direct property access:

```typescript
import { form, required, email, min } from '@angora-js/forms';

interface RegisterModel {
  username: string;
  email: string;
  age: number;
}

export class RegisterComponent {
  registerForm = form<RegisterModel>({
    username: ['', required],
    email: ['', [required, email]],
    age: [18, min(18)],
  });

  onSubmit() {
    if (this.registerForm.valid()) {
      console.log('Valid data:', this.registerForm.value());
    }
  }
}
```

Template binding:

```html
<form (submit)="onSubmit()">
  <input
    [value]="registerForm.username.value()"
    (input)="registerForm.username.set($event.target.value)"
  />
  @if (registerForm.username.invalid() && registerForm.username.touched()) {
  <span class="error">Username is required</span>
  }
  <button type="submit" [disabled]="registerForm.invalid()">Register</button>
</form>
```

---

## 🧹 8. Removing Angular Legacy Configs

1. **Delete `angular.json`**: Replace with modern, minimal `vite.config.ts`.
2. **Remove `zone.js` and `polyfills.ts`**: Angora runs with zero polyfills in modern browsers.
3. **Update `package.json` scripts**:
   ```json
   {
     "scripts": {
       "dev": "vite",
       "build": "vite build",
       "preview": "vite preview"
     }
   }
   ```
4. **Configure `vite.config.ts`**:
   ```typescript
   import { defineConfig } from 'vite';
   import { angora } from '@angora-js/vite-plugin';

   export default defineConfig({
     plugins: [angora()],
   });
   ```
