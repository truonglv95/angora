import { describe, it, expect } from 'bun:test';
import {
  Component,
  component,
  defineComponent,
  html,
  css,
  getComponentDef,
  signal,
} from '../src/index.ts';

describe('@angora-js/core - Component Shorthands & Functional API', () => {
  it('should support standard metadata object @Component({ template: "..." })', () => {
    @Component({
      selector: 'app-standard',
      template: '<h1>Standard</h1>',
      styles: ['.standard { color: blue; }'],
    })
    class StandardComponent {}

    const def = getComponentDef(StandardComponent);
    expect(def).toBeDefined();
    expect(def?.selector).toBe('app-standard');
    expect(def?.metadata.template).toBe('<h1>Standard</h1>');
    expect(def?.styles).toEqual(['.standard { color: blue; }']);
  });

  it('should support shorthand string template @Component("<h1>Shorthand</h1>")', () => {
    @Component('<button (click)="count.inc()">{{ count }}</button>')
    class ShorthandButton {
      count = signal(0);
    }

    const def = getComponentDef(ShorthandButton);
    expect(def).toBeDefined();
    expect(def?.selector).toBe('shorthand-button');
    expect(def?.metadata.template).toBe('<button (click)="count.inc()">{{ count }}</button>');
  });

  it('should support tagged template literal html`...` in @Component', () => {
    const title = 'Angora Reactive';
    @Component(html`
      <div class="card">
        <h2>${title}</h2>
      </div>
    `)
    class CardComponent {}

    const def = getComponentDef(CardComponent);
    expect(def).toBeDefined();
    expect(def?.selector).toBe('card-component');
    expect(def?.metadata.template).toContain('Angora Reactive');
    expect(def?.metadata.template).toContain('<div class="card">');
  });

  it('should support tagged template decorator syntax @(Component`...`)', () => {
    @(Component`<p>Tagged Decorator</p>`)
    class DirectTaggedComponent {}

    const def = getComponentDef(DirectTaggedComponent);
    expect(def).toBeDefined();
    expect(def?.selector).toBe('direct-tagged-component');
    expect(def?.metadata.template).toBe('<p>Tagged Decorator</p>');
  });

  it('should support bare decorator @Component', () => {
    @Component
    class BareComponent {}

    const def = getComponentDef(BareComponent);
    expect(def).toBeDefined();
    expect(def?.selector).toBe('bare-component');
    expect(def?.metadata.template).toBe('');
  });

  it('should evaluate css tagged template correctly', () => {
    const primary = '#ff0055';
    const stylesheet = css`
      .btn {
        background-color: ${primary};
      }
    `;
    expect(stylesheet).toContain('background-color: #ff0055;');
  });

  it('should support concise functional component factory component(template, setup)', () => {
    const Counter = component('<button (click)="count.inc()">{{ count() }}</button>', () => {
      const count = signal(10);
      return { count };
    });

    const def = getComponentDef(Counter);
    expect(def).toBeDefined();
    expect(def?.metadata.template).toBe('<button (click)="count.inc()">{{ count() }}</button>');

    const instance = new (Counter as any)();
    expect(instance.count()).toBe(10);
    instance.count.inc();
    expect(instance.count()).toBe(11);
  });

  it('should support defineComponent alias with options object', () => {
    const UserProfile = defineComponent({
      selector: 'user-profile',
      template: '<span>{{ name }}</span>',
      setup() {
        return { name: 'Alice' };
      },
    });

    const def = getComponentDef(UserProfile);
    expect(def?.selector).toBe('user-profile');
    const instance = new (UserProfile as any)();
    expect(instance.name).toBe('Alice');
  });
});
