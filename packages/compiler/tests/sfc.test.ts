import { describe, it, expect } from 'bun:test';
import { compileSfc } from '../src/index.ts';

describe('@angora-js/compiler - Single-File Component (.angora / .ag) Compiler', () => {
  it('should compile a complete SFC with script, template, and scoped styles', () => {
    const sfcSource = `
<script>
  import { signal } from '@angora-js/core';
  const count = signal(0);
  function increment() {
    count.update(n => n + 1);
  }
</script>

<template>
  <div class="counter">
    <button (click)="increment()">Count: {{ count() }}</button>
  </div>
</template>

<style scoped>
  .counter {
    padding: 1rem;
  }
  button {
    font-weight: bold;
  }
</style>
`;

    const compiled = compileSfc(sfcSource, { filename: 'my-counter.angora' });

    expect(compiled).toContain('selector: "my-counter"');
    expect(compiled).toContain('scopeId: "_angora-my-counter"');
    expect(compiled).toContain('.counter[_angora-my-counter]');
    expect(compiled).toContain('button[_angora-my-counter]');
    expect(compiled).toContain('_angora-my-counter=""');
    expect(compiled).toContain('setup()');
    expect(compiled).toContain('return { count, increment };');
    expect(compiled).toContain('render:');
    expect(compiled).toContain('ssrRender:');
    expect(compiled).toContain('export default __angora_sfc__;');
  });

  it('should compile an SFC without style block', () => {
    const sfcSource = `
<script>
  const message = 'Hello Angora SFC';
</script>

<template>
  <h1>{{ message }}</h1>
</template>
`;

    const compiled = compileSfc(sfcSource, { filename: 'hello-msg.angora' });

    expect(compiled).toContain('selector: "hello-msg"');
    expect(compiled).toContain('return { message };');
    expect(compiled).toContain('setup()');
    expect(compiled).toContain('render:');
    expect(compiled).toContain('ssrRender:');
  });

  it('should compile a template-only SFC', () => {
    const sfcSource = `
<template>
  <div class="card">
    <p>Static Card Content</p>
  </div>
</template>
`;

    const compiled = compileSfc(sfcSource, { filename: 'static-card.ag' });

    expect(compiled).toContain('selector: "static-card"');
    expect(compiled).toContain('render:');
    expect(compiled).toContain('ssrRender:');
    expect(compiled).toContain('export default __angora_sfc__;');
  });

  it('should support scoped CSS with pseudo-classes in SFC', () => {
    const sfcSource = `
<template>
  <button class="btn">Click</button>
</template>

<style scoped>
  .btn:hover {
    color: red;
  }
</style>
`;

    const compiled = compileSfc(sfcSource, { filename: 'hover-btn.angora' });

    expect(compiled).toContain('.btn[_angora-hover-btn]:hover');
  });
});
