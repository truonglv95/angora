import { describe, test, expect } from 'bun:test';
import {
  formatAngoraTemplate,
  formatComponentTemplate,
  tokenizeTemplate,
} from '../src/formatter.ts';

describe('@angora-js/prettier-plugin - Template Formatting Engine', () => {
  test('should format basic HTML tags with proper nesting and indentation', () => {
    const unformatted = `<div><h1>Title</h1><p>Description text</p></div>`;
    const formatted = formatAngoraTemplate(unformatted, { tabWidth: 2 });

    expect(formatted).toBe(`<div>
  <h1>
    Title
  </h1>
  <p>
    Description text
  </p>
</div>`);
  });

  test('should format modern @if / @else if / @else control flow blocks', () => {
    const unformatted = `@if (isLoggedIn()) { <div class="welcome"><span>Hello</span></div> } @else if (isGuest()) { <p>Guest</p> } @else { <button>Login</button> }`;
    const formatted = formatAngoraTemplate(unformatted, { tabWidth: 2 });

    expect(formatted).toBe(`@if (isLoggedIn()) {
  <div class="welcome">
    <span>
      Hello
    </span>
  </div>
} @else if (isGuest()) {
  <p>
    Guest
  </p>
} @else {
  <button>
    Login
  </button>
}`);
  });

  test('should format modern @for with track and @empty blocks', () => {
    const unformatted = `@for (user of users(); track user.id) { <li>{{user.name}}</li> } @empty { <p>No users</p> }`;
    const formatted = formatAngoraTemplate(unformatted, { tabWidth: 2 });

    expect(formatted).toBe(`@for (user of users(); track user.id) {
  <li>
    {{ user.name }}
  </li>
} @empty {
  <p>
    No users
  </p>
}`);
  });

  test('should format @switch / @case / @default selection blocks', () => {
    const unformatted = `@switch (role()) { @case ('admin') { <admin-panel /> } @case ('editor') { <editor-panel /> } @default { <user-panel /> } }`;
    const formatted = formatAngoraTemplate(unformatted, { tabWidth: 2 });

    expect(formatted).toBe(`@switch (role()) {
  @case ('admin') {
    <admin-panel />
  }
  @case ('editor') {
    <editor-panel />
  }
  @default {
    <user-panel />
  }
}`);
  });

  test('should format @defer blocks with triggers and placeholders', () => {
    const unformatted = `@defer (on viewport; prefetch on idle) { <heavy-chart /> } @placeholder { <skeleton /> } @loading { <spinner /> }`;
    const formatted = formatAngoraTemplate(unformatted, { tabWidth: 2 });

    expect(formatted).toBe(`@defer (on viewport; prefetch on idle) {
  <heavy-chart />
} @placeholder {
  <skeleton />
} @loading {
  <spinner />
}`);
  });

  test('should clean and normalize interpolations with consistent spacing', () => {
    const unformatted = `<h1>{{count()  *   2}}</h1>`;
    const formatted = formatAngoraTemplate(unformatted);

    expect(formatted).toContain('{{ count()  *   2 }}');
  });

  test('should format inline templates inside @Component decorator', () => {
    const sourceCode = `
import { Component, signal } from '@angora-js/core';

@Component({
  selector: 'app-test',
  template: \`<div><h1>{{ title() }}</h1>@if (show()) { <p>Visible</p> }</div>\`,
})
export class TestComponent {
  title = signal('Test');
  show = signal(true);
}
`;
    const formatted = formatComponentTemplate(sourceCode, { tabWidth: 2 });

    expect(formatted).toContain('@if (show()) {');
    expect(formatted).toContain('    <p>');
    expect(formatted).toContain('      Visible');
    expect(formatted).toContain('    </p>');
    expect(formatted).toContain('  }');
  });
});
