import { describe, it, expect, beforeEach } from 'bun:test';
import { scopeCss } from '../src/scoped-css.ts';
import { transformComponent } from '../src/index.ts';
import { injectComponentStyles, getInjectedStyles, clearInjectedStyles } from '@angora-js/runtime';

describe('@angora-js/compiler - Scoped CSS & ViewEncapsulation Engine', () => {
  beforeEach(() => {
    clearInjectedStyles();
  });

  it('should scope simple tag, class, and id selectors', () => {
    const css = `
      h1 { color: red; }
      .card { padding: 1rem; }
      #header { margin-bottom: 2rem; }
    `;
    const scoped = scopeCss(css, '_angora-c0');
    expect(scoped).toContain('h1[_angora-c0] { color: red; }');
    expect(scoped).toContain('.card[_angora-c0] { padding: 1rem; }');
    expect(scoped).toContain('#header[_angora-c0] { margin-bottom: 2rem; }');
  });

  it('should scope combinators and compound selectors', () => {
    const css = `
      .card > h1.title { font-size: 2rem; }
      ul li + li { margin-top: 0.5rem; }
    `;
    const scoped = scopeCss(css, '_angora-c1');
    expect(scoped).toContain('.card[_angora-c1] > h1.title[_angora-c1] { font-size: 2rem; }');
    expect(scoped).toContain(
      'ul[_angora-c1] li[_angora-c1] + li[_angora-c1] { margin-top: 0.5rem; }'
    );
  });

  it('should handle pseudo-classes and pseudo-elements accurately', () => {
    const css = `
      button:hover { background: blue; }
      a:not(.active) { opacity: 0.7; }
      p::before { content: "• "; }
      input:focus:disabled { border-color: gray; }
    `;
    const scoped = scopeCss(css, '_angora-c2');
    expect(scoped).toContain('button[_angora-c2]:hover { background: blue; }');
    expect(scoped).toContain('a[_angora-c2]:not(.active) { opacity: 0.7; }');
    expect(scoped).toContain('p[_angora-c2]::before { content: "• "; }');
    expect(scoped).toContain('input[_angora-c2]:focus:disabled { border-color: gray; }');
  });

  it('should handle :host and :host(...) selectors', () => {
    const css = `
      :host { display: block; border: 1px solid #ccc; }
      :host(.active) { border-color: green; }
      :host > .badge { font-weight: bold; }
    `;
    const scoped = scopeCss(css, '_angora-c3');
    expect(scoped).toContain('[_angora-c3] { display: block; border: 1px solid #ccc; }');
    expect(scoped).toContain('[_angora-c3].active { border-color: green; }');
    expect(scoped).toContain('[_angora-c3] > .badge[_angora-c3] { font-weight: bold; }');
  });

  it('should preserve @keyframes and scope rules inside @media queries', () => {
    const css = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      @media (max-width: 600px) {
        .container { flex-direction: column; }
      }
    `;
    const scoped = scopeCss(css, '_angora-c4');
    expect(scoped).toContain('@keyframes pulse');
    expect(scoped).toContain('0% { transform: scale(1); }');
    expect(scoped).toContain('@media (max-width: 600px)');
    expect(scoped).toContain('.container[_angora-c4] { flex-direction: column; }');
  });

  it('should transform component with styles, generate scope attribute, and inject styles', () => {
    const source = `
      import { Component, signal } from '@angora-js/core';

      @Component({
        selector: 'app-alert',
        template: \`<div class="alert"><p>Warning!</p></div>\`,
        styles: [\`
          .alert { background: yellow; }
          p { margin: 0; }
        \`]
      })
      export class AlertComponent {
        type = signal('warning');
      }
    `;

    const transformed = transformComponent(source);

    // Expect scope attribute to be added in template
    expect(transformed).toContain('_angora-app-alert');
    expect(transformed).toContain("injectComponentStyles('_angora-app-alert'");
    expect(transformed).toContain('.alert[_angora-app-alert]');
    expect(transformed).toMatch(/__angora_scope_id__\s*=\s*['"]_angora-app-alert['"]/);
  });

  it('should manage style injection and deduplication in runtime', () => {
    injectComponentStyles('_angora-btn', 'button[_angora-btn] { color: blue; }');
    injectComponentStyles('_angora-btn', 'button[_angora-btn] { color: blue; }');

    const allStyles = getInjectedStyles();
    expect(allStyles.length).toBe(1);
    expect(allStyles[0].scopeId).toBe('_angora-btn');
    expect(allStyles[0].css).toContain('button[_angora-btn]');
  });
});
