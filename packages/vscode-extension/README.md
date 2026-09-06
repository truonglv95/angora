# Angora Language Tools for Visual Studio Code

Official Visual Studio Code extension for the **Angora Framework** (`@angora`).

Provides high-performance template syntax highlighting, real-time type checking and diagnostics, rich hover documentation, autocompletions, and Go to Definition (F12) support.

## Features

- 🔴 **Real-Time Template Diagnostics & Type Checking**:
  - Catches type mismatches between component properties and HTML element inputs (e.g. `<input [disabled]="title()" />` where `title()` is `string` vs `boolean`).
  - Detects undeclared component properties/methods referenced in templates (`TS2339`).
  - Warns when signals are bound without invocation (`Did you mean to call 'isPending()'?`).
  - Verifies standalone imports and flags missing components (`NG8001`), missing directives (`NG8002`), and missing pipes (`NG8004`).
- 💡 **Hover Documentation**:
  - Hover over template variables to view full TypeScript signatures (`Signal<T>`, method signatures) and JSDoc docstrings.
  - Hover over element properties to inspect expected DOM types (`HTMLInputElement.disabled: boolean`).
  - Hover over control flow (`@if`, `@for`, `@switch`, `@defer`) and pipes (`| uppercase`, `| currency`) for interactive guides.
- 🎯 **Go to Definition (F12)**:
  - Jump directly from template expressions to property and method definitions in your TypeScript component class.
  - Jump from custom element tags (e.g. `<user-card />`) directly to component imports and source files.
  - Jump from `#ref` template reference variables to their declaration elements.
- ⚡ **Zero External Dependencies**:
  - Pure in-memory Language Service running at native speeds.

## Installation

Install via the VS Code Extensions View:

1. Open Visual Studio Code.
2. Press `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Windows/Linux).
3. Select **Extensions: Install from VSIX...**
4. Select `angora-language-tools-0.1.0.vsix`.

Enjoy building blazing-fast applications with Angora!
