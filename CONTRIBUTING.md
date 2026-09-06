# Contributing to @angora Framework

Thank you for your interest in contributing to Angora! We are building the next-generation Zero-Virtual-DOM frontend platform, and your help is deeply appreciated.

---

## 🛠️ Development Setup

### Prerequisites

- [Bun](https://bun.sh) (v1.1+ recommended)
- [Rust & Cargo](https://rustup.rs) (latest stable)
- [Node.js](https://nodejs.org) (v20+ for npm tool compatibility)

### 1. Clone & Install

```bash
git clone https://github.com/angora-js/angora.git
cd angora
bun install
```

### 2. Build Native Rust Compiler

The compiler bridge requires building the native Rust binary:

```bash
cargo build --release
```

### 3. Run Test Suites

```bash
# Run all TypeScript tests
bun test

# Run Rust compiler unit tests
cargo test

# Run native Go TypeScript 7 typecheck
bun -e "import { runTypecheck } from './packages/compiler/src/typecheck.ts'; runTypecheck('.').then(r => console.log('Errors:', r.diagnostics.length));"
```

### 4. Code Style & Formatting

We use `oxlint` and `oxfmt` for blazing-fast linting and formatting:

```bash
# Run linter
bun run lint

# Format code
bun run format
```

---

## 📐 Commit Convention

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat(core)`: A new feature for `@angora-js/core`
- `fix(compiler)`: A bug fix in `@angora-js/compiler` or `angora_oxc`
- `docs`: Documentation changes
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `refactor`: A code change that neither fixes a bug nor adds a feature

---

## 🚀 Creating Pull Requests

1. Fork the repository and create your branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes and ensure all tests pass (`bun test` and `cargo test`).
3. Add unit tests for any new features or bug fixes.
4. Push to your fork and submit a Pull Request to `main`.
