import { describe, it, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { Component, Directive, ElementRef, inject, signal } from '@angora-js/core';
import { applyMatchingDirectives, matchesDirective } from '../src/directives.ts';
import { mountComponent } from '../src/mount.ts';

describe('@angora-js/runtime - Directive Matching & Runtime Template Imports', () => {
  beforeEach(() => {
    const window = new Window();
    (globalThis as any).window = window;
    (globalThis as any).document = window.document;
    (globalThis as any).HTMLElement = (window as any).HTMLElement;
  });
  it('should match directive by attribute selector', () => {
    @Directive({
      selector: '[appHighlight]',
    })
    class HighlightDirective {}

    const el = document.createElement('div');
    expect(matchesDirective(HighlightDirective, el)).toBe(false);

    el.setAttribute('appHighlight', '');
    expect(matchesDirective(HighlightDirective, el)).toBe(true);
  });

  it('should auto-apply matching directives from component imports', () => {
    let appliedCount = 0;

    @Directive({
      selector: '[autoActive]',
      host: {
        '[class.active]': 'isActive',
      },
    })
    class AutoActiveDirective {
      public isActive = true;
      constructor() {
        appliedCount++;
      }
    }

    @Component({
      selector: 'parent-comp',
      imports: [AutoActiveDirective],
      template: '<div>Parent</div>',
    })
    class ParentComponent {}

    const parentInstance = new ParentComponent();
    const btn = document.createElement('button');
    btn.setAttribute('autoActive', '');

    const directives = applyMatchingDirectives(btn, parentInstance);
    expect(directives).toHaveLength(1);
    expect(appliedCount).toBe(1);
    expect(btn.classList.contains('active')).toBe(true);
  });

  it('should warn in dev mode when custom element tag is not imported', () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      warnings.push(args.join(' '));
    };

    try {
      @Component({
        selector: 'host-comp',
        imports: [],
        template: '<div>Host</div>',
      })
      class HostComponent {}

      const hostInstance = new HostComponent();
      const div = document.createElement('div');
      mountComponent('unimported-child', div, hostInstance);

      expect(warnings.some(w => w.includes('NG8001'))).toBe(true);
      expect(warnings.some(w => w.includes('unimported-child'))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });
});
