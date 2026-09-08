import { describe, test, expect } from 'bun:test';
import {
  checkNoUncalledSignals,
  checkUnusedImports,
  checkSafeEffects,
  lintAngoraSource,
} from '../src/index.ts';

describe('@angora-js/eslint-plugin - Linter Rules', () => {
  test('should detect uncalled signal in interpolation {{ count }}', () => {
    const code = `
import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-counter',
  template: \`<h1>{{ count }}</h1>\`,
})
export class CounterComponent {
  count = signal(0);
}
`;
    const diags = checkNoUncalledSignals(code);
    expect(diags.length).toBe(1);
    expect(diags[0].rule).toBe('angora/no-uncalled-signals');
    expect(diags[0].message).toContain("Did you mean 'count()'?");
  });

  test('should not flag properly called signal {{ count() }}', () => {
    const code = `
import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-counter',
  template: \`<h1>{{ count() }}</h1>\`,
})
export class CounterComponent {
  count = signal(0);
}
`;
    const diags = checkNoUncalledSignals(code);
    expect(diags.length).toBe(0);
  });

  test('should detect unused imports in @Component.imports', () => {
    const code = `
import { Component } from '@angora-js/core';
import { UnusedCardComponent } from './unused-card.component.ts';

@Component({
  selector: 'app-test',
  imports: [UnusedCardComponent],
  template: \`<div><p>Hello world</p></div>\`,
})
export class TestComponent {}
`;
    const diags = checkUnusedImports(code);
    expect(diags.length).toBe(1);
    expect(diags[0].rule).toBe('angora/unused-imports');
    expect(diags[0].message).toContain('UnusedCardComponent');
  });

  test('should handle forwardRef and thunk imports in @Component.imports', () => {
    const code = `
import { Component, forwardRef } from '@angora-js/core';

@Component({
  selector: 'app-test',
  imports: () => [forwardRef(() => UsedCardComponent)],
  template: \`<div><used-card></used-card></div>\`,
})
export class TestComponent {}
`;
    const diags = checkUnusedImports(code);
    expect(diags.length).toBe(0);
  });

  test('should detect unsafe effect() created inside component method without injector', () => {
    const code = `
import { Component, effect } from '@angora-js/core';

@Component({
  selector: 'app-demo',
  template: \`<button (click)="startListening()">Start</button>\`,
})
export class DemoComponent {
  startListening() {
    effect(() => {
      console.log('leaked effect');
    });
  }
}
`;
    const diags = checkSafeEffects(code);
    expect(diags.length).toBe(1);
    expect(diags[0].rule).toBe('angora/safe-effects');
    expect(diags[0].message).toContain('requires an explicit Injector');
  });

  test('should run all rules together through lintAngoraSource', () => {
    const code = `
import { Component, signal, effect } from '@angora-js/core';
import { GhostComponent } from './ghost.component.ts';

@Component({
  selector: 'app-full',
  imports: [GhostComponent],
  template: \`<div>{{ score }}</div>\`,
})
export class FullComponent {
  score = signal(100);

  onAction() {
    effect(() => {});
  }
}
`;
    const diags = lintAngoraSource(code);
    expect(diags.length).toBe(3);
    const rules = diags.map(d => d.rule);
    expect(rules).toContain('angora/no-uncalled-signals');
    expect(rules).toContain('angora/unused-imports');
    expect(rules).toContain('angora/safe-effects');
  });
});
