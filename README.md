# 🐾 Angora Framework

<div align="center">

![Angora Architecture](https://img.shields.io/badge/Architecture-Zero--VDOM%20%7C%20Signals-6366f1?style=for-the-badge)
![Compiler](<https://img.shields.io/badge/Compiler-Native%20Rust%20OXC%20(%3C0.1ms)-f97316?style=for-the-badge>)
![Typecheck](https://img.shields.io/badge/Typecheck-TypeScript%207%20Native%20Go-10b981?style=for-the-badge)
![Tests](<https://img.shields.io/badge/Tests-329%2F329%20PASS%20(100%25)-22c55e?style=for-the-badge>)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**The Next-Generation Zero-Virtual-DOM Frontend Platform.**  
_Angular's structured enterprise ergonomics married with SolidJS-grade fine-grained speed._

[Quick Start](#-quick-start) • [Architecture](#-architecture) • [Feature Matrix](#-competitive-feature-matrix) • [Packages](#-monorepo-packages) • [Documentation](#-documentation)

</div>

---

## ⚡ What is Angora?

**Angora** is an ultra-high-performance web framework designed for modern web applications and enterprise platforms. It combines the declarative class-and-decorator developer experience of Angular with the raw performance and micro-bundle footprint of a **Zero-Virtual DOM template-cloning architecture**.

- 🚀 **Zero-Virtual DOM**: No virtual DOM diffing tree overhead. DOM nodes are cloned via `<template>` and mutated $O(1)$ directly at the exact reactive boundary.
- ⚡ **Native Rust OXC Compiler**: Microsecond component, template, scoped CSS, and synthetic Type Check Block (TCB) generation ($<0.1\text{ms}$ per file).
- 🏎️ **TypeScript 7.0 Native Go Engine**: Sub-second full-workspace template type checking (~679ms) with source map reverse diagnostics.
- 💉 **Hierarchical Dependency Injection**: First-class runtime DI with `Injector`, `InjectionToken`, `inject()`, and `provide()`.
- 🌐 **Full-Stack Meta-Framework (`@angora-js/start`)**: File-based routing, type-safe RPC server functions (`server$`), zero-CLS image optimization, streaming SSR, and Cloudflare/Vercel/Node adapters.
- 📦 **Enterprise Ecosystem**: Built-in `@angora-js/query` (SWR), `@angora-js/primitives` (100k+ row virtualizer), `@angora-js/i18n` (ICU MessageFormat), `@angora-js/router` (HTML5 View Transitions), and `@angora-js/forms` (Reactive Forms).

---

## 🚀 Quick Start

Create a new Angora application in seconds:

```bash
# Using npm
npm create angora@latest my-app

# Using Bun
bun create angora my-app

# Using pnpm
pnpm create angora my-app
```

Choose from 4 official templates:

- `minimal`: Ultra-lightweight SPA with fine-grained reactivity.
- `fullstack`: Full-stack `@angora-js/start` project with SSR, file-based routing, and `server$`.
- `enterprise`: Complete enterprise architecture with Router 2.0, Reactive Forms, UI Suite, and `@angora-js/query`.
- `tailwind`: Integrated with `@angora-js/primitives` and Tailwind CSS.

---

## 💻 Code at a Glance

Writing Angora components is lean, fast, and free of ceremonial boilerplate:

```typescript
import { Component, signal, computed, CurrencyPipe } from '@angora-js/core';

// No manual selector needed (defaults to <counter-component>)
// No manual imports array needed (Rust compiler auto-resolves CurrencyPipe)
@Component({
  template: `
    <div class="card">
      <h2>🐾 Counter: {{ count() }}</h2>
      <p>Double: {{ double() }} | Price: {{ count() * 9.99 | currency: 'USD' }}</p>

      <div class="actions">
        <!-- Direct signal ergonomics -->
        <button (click)="count.inc()">+ Increment</button>
        <button (click)="count.dec()">- Decrement</button>
        <button (click)="count(0)">Reset</button>
      </div>

      @if (count() >= 10) {
        <span class="badge badge-success">Milestone Reached! 🎉</span>
      } @else {
        <span class="badge">Keep going...</span>
      }
    </div>
  `,
})
export class CounterComponent {
  count = signal(0);
  double = computed(() => this.count() * 2);
}
```

---

## 🪄 Modern Developer Experience (DX)

Angora eliminates legacy framework ceremonies, offering the most concise, expressive, and productive developer experience in the modern frontend ecosystem:

### 1. Auto-Selectors & Auto-Imports

Gone are the days of repetitive `selector` strings and bloated `imports: [...]` arrays:

- **Auto-Selector**: Omit `selector`, and Angora automatically derives `<counter-component>` or `<app-counter>` from your class name.
- **Auto-Imports**: The native Rust OXC compiler inspects your file's TypeScript imports and automatically registers child components, directives, and pipes in your template.

```typescript
import { Component, signal } from '@angora-js/core';
import { UserAvatar } from './user-avatar.ts';
import { TimeAgoPipe } from './time-ago.pipe.ts';

// No selector: '' or imports: [UserAvatar, TimeAgoPipe] needed!
@Component({
  template: `
    <user-avatar [user]="user()" />
    <span>{{ user().createdAt | timeAgo }}</span>
  `,
})
export class ProfileHeader {
  user = signal({ name: 'Alice', createdAt: Date.now() });
}
```

---

### 2. Signal Ergonomics (`.inc()`, `.dec()`, `.toggle()`, `sig(val)`)

Signals in Angora are concise, callable, and feature first-class arithmetic shortcuts:

```typescript
const count = signal(0);
const isOpen = signal(false);

count.inc(); // count.set(1)
count.dec(); // count.set(0)
count.inc(5); // count.set(5)
isOpen.toggle(); // isOpen.set(true)
count(42); // Setter call shortcut for count.set(42)
```

---

### 3. `model()` Two-Way Binding Primitives

Create synchronized two-way bindings in a single line without the `@Input()` + `@Output() change = new EventEmitter()` boilerplate:

```typescript
import { Component, model } from '@angora-js/core';

@Component({
  template: `
    <button (click)="value.dec()">-</button>
    <span>{{ value() }}</span>
    <button (click)="value.inc()">+</button>
  `,
})
export class StepperComponent {
  // Automatically exposes [value] input and (valueChange) output!
  value = model(0);
}

// In parent template:
// <stepper-component [(value)]="quantity" />
```

---

### 4. Functional Components & Functional Pipes

Need a lean UI atom or transform? You don't need heavy class definitions:

```typescript
import { component, pipe } from '@angora-js/core';

// Functional Component
export const Badge = component({
  template: `<span class="badge">{{ text() }}</span>`,
  setup: props => ({ text: () => props.text || 'Default' }),
});

// Functional Pipe
export const uppercase = pipe('uppercase', (val: string) => val.toUpperCase());
```

---

### 5. `reactive()` & `toRefs()`

Enjoy Vue/Solid-like transparent object reactivity with safe signal destructuring:

```typescript
import { reactive, toRefs } from '@angora-js/core';

const state = reactive({
  username: 'alice',
  theme: 'dark',
});

// Destructure without losing signal reactivity:
const { username, theme } = toRefs(state);
username.set('bob');
console.log(state.username); // 'bob'
```

---

### 6. Composable Router Hooks

Navigate and inspect route state anywhere without constructor DI ceremony:

```typescript
import { useRouter, useParams, useQueryParams, useRoute } from '@angora-js/router';

export class ProductDetailComponent {
  private router = useRouter();
  params = useParams(); // Signal of { id: '123' }
  query = useQueryParams(); // Signal of { tab: 'reviews' }

  checkout() {
    this.router.navigate(['/checkout', this.params().id]);
  }
}
```

---

### 7. Signal Forms (`@angora-js/forms`)

Define reactive, type-safe forms in a fraction of the code of traditional reactive forms:

```typescript
import { form, required, email, minLength, bindForm } from '@angora-js/forms';

const loginForm = form({
  email: ['', [required, email]],
  password: ['', [required, minLength(8)]],
  rememberMe: false, // auto-wrapped in FormControl
});

// Direct property access & signal ergonomics:
loginForm.email.set('alice@angora.dev');
loginForm.email.update(val => val.trim());

console.log(loginForm.valid()); // boolean Signal
console.log(loginForm.email.errors()); // Signal: { required: true } | null
console.log(loginForm.value()); // Signal: { email: '...', password: '...', rememberMe: false }

// Reset all values back to defaults:
loginForm.reset();
```

Zero-ceremony DOM binding with `bindForm`:

```typescript
// Automatically wires inputs by name, updates ng-valid/ng-dirty CSS classes,
// marks all touched on submit, and invokes callback when valid:
const unbind = bindForm(formElement, loginForm, values => {
  console.log('Submitted:', values);
});
```

---

### 8. Signals Data Query & SWR (`@angora-js/query`)

Built-in enterprise caching, automatic signal dependency tracking, and optimistic mutations:

```typescript
import { useQuery, useMutation, useQueryClient } from '@angora-js/query';

// Shorthand Query with Stale-While-Revalidate (SWR):
const {
  data: todos,
  isLoading,
  error,
  refetch,
} = useQuery(
  ['todos'],
  fetchTodos,
  { staleTime: 60_000 } // 1 min fresh cache
);

// Reactive Query: automatically refetches whenever userId() signal changes!
const user = useQuery(() => ({
  queryKey: ['user', userId()],
  queryFn: () => fetchUser(userId()),
}));

// Optimistic Mutation:
const queryClient = useQueryClient();
const addTodo = useMutation((title: string) => api.createTodo(title), {
  onSuccess: () => {
    queryClient.invalidateQueries(['todos']);
  },
});
```

---

## 📊 Competitive Feature Matrix

| Capability                 |            **@angora**            |    **Angular 19/20**     |      **React 19**       |       **Vue 3.5**       |     **Svelte 5**     | **SolidJS 1.8+**  |
| :------------------------- | :-------------------------------: | :----------------------: | :---------------------: | :---------------------: | :------------------: | :---------------: |
| **DOM Engine**             |       **Zero-VDOM (Clone)**       |  Incremental DOM (Ivy)   |    VDOM (Fiber Diff)    |       Hybrid VDOM       |  Zero-VDOM (Clone)   | Zero-VDOM (Clone) |
| **Reactivity**             |    **Signals + linkedSignal**     |  Signals + linkedSignal  |    Hooks (Re-render)    |  Reactivity Transform   |   Runes (`$state`)   |  Signals + Memos  |
| **Component Model**        |     **TS Class + Decorators**     |  TS Class + Decorators   |     Functional JSX      |  SFC `<script setup>`   |   `.svelte` Blocks   |  Functional JSX   |
| **Compiler Speed**         |       **Rust OXC (<0.1ms)**       |   JS `ngtsc` (~3-8ms)    |       Babel / SWC       |   JS `@vue/compiler`    |     JS Compiler      |    Babel / SWC    |
| **Typecheck Speed**        |    **Native Go TS7 (~679ms)**     |  Standard `tsc` (2-5s)   |     Standard `tsc`      |    `vue-tsc` (3-6s)     |    `svelte-check`    |  Standard `tsc`   |
| **Dependency Injection**   |   **First-Class Hierarchical**    | First-Class Hierarchical |  Context API (Limited)  |    Provide / Inject     |     Context API      |    Context API    |
| **Reactive Forms**         |   **Built-in FormGroup/Array**    | Built-in FormGroup/Array | 3rd Party (RHF/Formik)  | 3rd Party (VeeValidate) |      3rd Party       |     3rd Party     |
| **Data Fetching (SWR)**    | **`@angora-js/query` (Built-in)** |   3rd Party (TanStack)   | 3rd Party (React Query) |  3rd Party (TanStack)   |      3rd Party       | `createResource`  |
| **100k Virtual Scrolling** |    **`@angora-js/primitives`**    |      `@angular/cdk`      |  3rd Party (TanStack)   |        3rd Party        |      3rd Party       |     3rd Party     |
| **View Transitions**       |    **`withViewTransitions()`**    | `withViewTransitions()`  |   ViewTransition API    |         Manual          | Built-in Transitions |     3rd Party     |
| **Gzip Core Size**         |            **~5.5 KB**            |       ~35 - 50 KB        |         ~45 KB          |         ~16 KB          |       ~5.0 KB        |      ~6.5 KB      |

---

## 📦 Monorepo Packages

| Package                                                                                                           | Version | Description                                                                              |
| :---------------------------------------------------------------------------------------------------------------- | :-----: | :--------------------------------------------------------------------------------------- |
| **[`@angora-js/core`](file:///Users/truong/Documents/product/angora/packages/core)**                              | `0.1.0` | Fine-grained reactive signals, dependency injection, and component primitives            |
| **[`@angora-js/compiler`](file:///Users/truong/Documents/product/angora/packages/compiler)**                      | `0.1.0` | Native Rust OXC template compiler, scoped CSS, and TCB generation                        |
| **[`@angora-js/runtime`](file:///Users/truong/Documents/product/angora/packages/runtime)**                        | `0.1.0` | Zero-VDOM template cloning engine, DOM binding, and Click-to-Source inspector            |
| **[`@angora-js/router`](file:///Users/truong/Documents/product/angora/packages/router)**                          | `0.1.0` | SPA router with lazy loading, guards, resolvers, and HTML5 View Transitions              |
| **[`@angora-js/forms`](file:///Users/truong/Documents/product/angora/packages/forms)**                            | `0.1.0` | Signal-powered reactive forms, dynamic `FormArray`, and async validation                 |
| **[`@angora-js/query`](file:///Users/truong/Documents/product/angora/packages/query)**                            | `0.1.0` | Signals-powered enterprise data fetching, SWR, optimistic updates, and SSR dehydration   |
| **[`@angora-js/primitives`](file:///Users/truong/Documents/product/angora/packages/primitives)**                  | `0.1.0` | Headless WAI-ARIA 1.2 UI primitives and $O(1)$ 100k-row virtual scrolling engine         |
| **[`@angora-js/i18n`](file:///Users/truong/Documents/product/angora/packages/i18n)**                              | `0.1.0` | Signal-driven internationalization, ICU MessageFormat (plurals/select), and locale pipes |
| **[`@angora-js/start`](file:///Users/truong/Documents/product/angora/packages/start)**                            | `0.1.0` | Full-stack meta-framework, `server$` RPC, edge adapters, and Core Web Vitals             |
| **[`@angora-js/ui`](file:///Users/truong/Documents/product/angora/packages/ui)**                                  | `0.1.0` | Accessible dialog, toast, select, tabs, menu, and SCSS design tokens                     |
| **[`@angora-js/animations`](file:///Users/truong/Documents/product/angora/packages/animations)**                  | `0.1.0` | Hardware-accelerated FLIP animations and micro-transitions                               |
| **[`@angora-js/http`](file:///Users/truong/Documents/product/angora/packages/http)**                              | `0.1.0` | Enterprise `HttpClient` with interceptor pipeline and reactive resource adapter          |
| **[`@angora-js/testing`](file:///Users/truong/Documents/product/angora/packages/testing)**                        | `0.1.0` | Zero-ceremony `TestBed`, `ComponentFixture`, `signalSpy`, and `userEvent` harness        |
| **[`@angora-js/devtools`](file:///Users/truong/Documents/product/angora/packages/devtools)**                      | `0.1.0` | Official Chrome DevTools browser extension and state inspector                           |
| **[`@angora-js/vite-plugin`](file:///Users/truong/Documents/product/angora/packages/vite-plugin)**                | `0.1.0` | Vite 8 Rolldown plugin with in-process Rust OXC bridge and Click-to-Source               |
| **[`@angora-js/prettier-plugin`](file:///Users/truong/Documents/product/angora/packages/prettier-plugin-angora)** | `0.1.0` | Prettier formatter for inline component templates and control flow blocks                |
| **[`@angora-js/eslint-plugin`](file:///Users/truong/Documents/product/angora/packages/eslint-plugin-angora)**     | `0.1.0` | ESLint rules for signals safety, unused component imports, and effect leaks              |
| **[`create-angora`](file:///Users/truong/Documents/product/angora/packages/create-angora)**                       | `0.1.0` | Official project scaffolding CLI (`npm create angora@latest`)                            |

---

## 🧪 Benchmark & Quality Assurance

Angora runs an automated test matrix with 100% green status across all suites:

- **35/35** Native Rust Compiler tests (`cargo test`)
- **294/294** TypeScript tests across 40 files (`bun test`)
- **12/12** Official Stefan Krause js-framework-benchmark tests:
  - Create 1,000 rows DOM: **~52ms**
  - Replace 1,000 rows DOM: **~70ms**
  - Partial update every 10th row: **~46ms**
  - Swap rows 1 & 998: **~61ms**
  - Clear 1,000 rows: **~35ms**
  - 10,000 rows memory load: **~0.22ms**
- **0 errors** full-workspace Go TypeScript 7 typecheck (`runTypecheck`) in **~679ms**

---

## 🤝 Contributing

We welcome contributions from developers worldwide! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting pull requests.

```bash
# 1. Clone the repository
git clone https://github.com/angora-js/angora.git
cd angora

# 2. Install dependencies
bun install

# 3. Build native Rust compiler
cargo build --release

# 4. Run tests
bun test
cargo test
```

---

## 📄 License

Angora is open-source software licensed under the [MIT License](LICENSE).
