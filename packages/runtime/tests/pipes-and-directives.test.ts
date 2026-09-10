import { describe, it, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import {
  Pipe,
  pipe,
  Directive,
  signal,
  ElementRef,
  COMPONENT_DEF,
  type PipeTransform,
  UpperCasePipe,
  LowerCasePipe,
  JsonPipe,
  CurrencyPipe,
  SlicePipe,
} from '@angora-js/core';
import { applyPipe, resolvePipe, registerPipe, applyDirective } from '@angora-js/runtime';
import { parseTemplate, compileTemplate } from '@angora-js/compiler';

describe('@angora-js/runtime - Pipes Engine (| pipe)', () => {
  it('should format standard built-in pipes directly', () => {
    expect(new UpperCasePipe().transform('hello world')).toBe('HELLO WORLD');
    expect(new LowerCasePipe().transform('ANGORA ROCKS')).toBe('angora rocks');
    expect(new JsonPipe().transform({ a: 1, b: 'test' }, 0)).toContain('"a":1');
    expect(new CurrencyPipe().transform(1234.5, 'USD')).toContain('1,234.50');
    expect(new SlicePipe().transform([1, 2, 3, 4, 5], 1, 3)).toEqual([2, 3]);
  });

  it('should resolve and execute built-in pipes via applyPipe', () => {
    registerPipe('uppercase', UpperCasePipe);
    registerPipe('slice', SlicePipe);

    const resUpper = applyPipe('uppercase', 'angora');
    expect(resUpper).toBe('ANGORA');

    const resSlice = applyPipe('slice', 'developer', [0, 3]);
    expect(resSlice).toBe('dev');
  });

  it('should support custom pipes with @Pipe decorator', () => {
    @Pipe({ name: 'reverse', pure: true })
    class ReversePipe implements PipeTransform {
      transform(val: string): string {
        return val ? val.split('').reverse().join('') : '';
      }
    }

    const ctx: any = {
      [COMPONENT_DEF]: {
        metadata: {
          imports: [ReversePipe],
        },
      },
    };

    const reversed = applyPipe('reverse', 'Angora', [], ctx);
    expect(reversed).toBe('arognA');
  });

  it('should compile pipe syntax in template expressions into applyPipe calls', () => {
    const template = `<span>{{ name() | uppercase }}</span>`;
    const ast = parseTemplate(template);
    const code = compileTemplate(ast);

    expect(code).toMatch(
      /applyPipe\(['"]uppercase['"],\s*ctx\.name\(\),\s*\[\],\s*ctx,\s*injector\)/
    );
  });

  it('should compile chained pipes with arguments in template expressions', () => {
    const template = `<span>{{ message() | uppercase | slice:0:4 }}</span>`;
    const ast = parseTemplate(template);
    const code = compileTemplate(ast);

    expect(code).toMatch(
      /applyPipe\(['"]slice['"],\s*applyPipe\(['"]uppercase['"],\s*ctx\.message\(\),\s*\[\],\s*ctx,\s*injector\),\s*\[0,\s*4\],\s*ctx,\s*injector\)/
    );
  });
});

describe('@angora-js/runtime - Directive Architecture (@Directive)', () => {
  let doc: any;

  beforeEach(() => {
    const window = new Window();
    (globalThis as any).document = window.document;
    (globalThis as any).HTMLElement = window.HTMLElement;
    (globalThis as any).Event = window.Event;
    doc = window.document;
  });

  it('should attach directive, inject ElementRef, and bind host styles & events', () => {
    @Directive({
      selector: '[appHighlight]',
      host: {
        '[style.backgroundColor]': 'color()',
        '(click)': 'onClick()',
      },
    })
    class HighlightDirective {
      color = signal('yellow');
      clicked = signal(false);

      constructor(public el: ElementRef<HTMLElement>) {}

      onClick() {
        this.clicked.set(true);
        this.color.set('orange');
      }
    }

    const btn = doc.createElement('button');
    doc.body.appendChild(btn);

    const directiveInstance = applyDirective(HighlightDirective, btn);

    expect(directiveInstance.el.nativeElement).toBe(btn);
    expect(btn.style.backgroundColor).toBe('yellow');

    // Trigger click event
    btn.click();

    expect(directiveInstance.clicked()).toBe(true);
    expect(btn.style.backgroundColor).toBe('orange');
  });

  it('should support functional pipes created with pipe()', () => {
    const reverse = pipe('reverse', (s: string) => s.split('').reverse().join(''));
    // Direct call
    expect(reverse('angora')).toBe('arogna');

    // In component context imports
    const ctx: any = {
      [COMPONENT_DEF]: {
        metadata: {
          imports: [reverse],
        },
      },
    };
    const result = applyPipe('reverse', 'hello', [], ctx);
    expect(result).toBe('olleh');
  });

  it('should auto-derive component selector from class name if omitted', () => {
    const { Component, getComponentDef } = require('@angora-js/core');
    @Component({
      template: '<h1>Hello</h1>',
    })
    class UserProfileCardComponent {}

    const def = getComponentDef(UserProfileCardComponent);
    expect(def?.selector).toBe('user-profile-card-component');
  });

  it('should auto-derive directive selector from class name if omitted', () => {
    const { Directive, getDirectiveDef } = require('@angora-js/core');
    @Directive()
    class CustomTooltipDirective {}

    const def = getDirectiveDef(CustomTooltipDirective);
    expect(def?.selector).toBe('[custom-tooltip-directive]');
  });
});
