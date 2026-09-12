# 🧪 Interactive Angora Sandbox & Quickstart

Get started with an interactive Angora development environment in seconds.

---

## ⚡ 1. Local Scaffolding with `create-angora`

Run the official interactive CLI:

```bash
# Using Bun (Recommended)
bun create angora my-angora-app

# Using npm
npm create angora@latest my-angora-app

# Using pnpm
pnpm create angora my-angora-app
```

Select a starter template:

1. **`minimal`**: Lightweight single-page app with fine-grained reactivity and signals.
2. **`enterprise`**: Complete workspace setup with `@angora-js/router`, `@angora-js/forms`, and `@angora-js/query`.
3. **`fullstack`**: Server-side rendered meta-framework setup powered by `@angora-js/start`.
4. **`tailwind`**: UI sandbox configured with Tailwind CSS and `@angora-js/primitives`.

---

## 🏃 2. Running the Interactive Development Server

Start the Vite development server with sub-millisecond Hot Module Replacement (HMR):

```bash
cd my-angora-app
bun install
bun run dev
```

Open your browser at `http://localhost:5173`. When you edit template HTML, signal logic, or scoped CSS, changes hot-swap in $<1\text{ms}$ while preserving existing signal values in memory.

---

## 🎮 3. Exploring the Built-in Krausest Benchmark Sandbox

To inspect live performance under 1,000 to 10,000 keyed items:

```bash
# Start the benchmark sandbox
bun run --cwd benchmarks/krausest dev
```

Visit `http://localhost:5174` to interactively run the Krausest suite in your browser:

- Click **Create 1,000 rows** to test instantaneous DOM cloning.
- Click **Update every 10th row** to observe fine-grained surgical micro-updates.
- Click **Swap Rows** to test $O(1)$ keyed node swaps.
- Open browser DevTools to inspect memory stability.
