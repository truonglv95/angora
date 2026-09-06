export interface GenerateResult {
  componentFileName: string;
  componentCode: string;
  testFileName: string;
  testCode: string;
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/^-+/, '');
}

export function toPascalCase(str: string): string {
  return str.replace(/(^\w|-\w)/g, clear => clear.replace('-', '').toUpperCase());
}

export function generateComponent(name: string): GenerateResult {
  const kebab = toKebabCase(name);
  const pascal = toPascalCase(name);
  const className = `${pascal}Component`;
  const selector = `app-${kebab}`;

  const componentCode = `import { Component, signal } from '@angora-js/core';

@Component({
  selector: '${selector}',
  template: \`
    <div class="${kebab}-container">
      <h2>{{ title() }}</h2>
    </div>
  \`,
  styles: [\`
    .${kebab}-container {
      display: block;
      padding: 1rem;
      border-radius: 8px;
    }
  \`],
})
export class ${className} {
  title = signal('${pascal} Works!');
}
`;

  const testCode = `import { describe, test, expect } from 'bun:test';
import { renderComponent } from '@angora-js/testing';
import { ${className} } from './${kebab}.component.ts';

describe('${className}', () => {
  test('should mount and display title signal', () => {
    const { nativeElement } = renderComponent(${className});
    expect(nativeElement.textContent).toContain('${pascal} Works!');
  });
});
`;

  return {
    componentFileName: `${kebab}.component.ts`,
    componentCode,
    testFileName: `${kebab}.component.test.ts`,
    testCode,
  };
}
