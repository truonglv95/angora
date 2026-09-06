export interface FormatterOptions {
  tabWidth?: number;
  useTabs?: boolean;
  printWidth?: number;
  singleQuote?: boolean;
}

type TokenType =
  | 'TEXT'
  | 'INTERPOLATION'
  | 'COMMENT'
  | 'TAG_OPEN'
  | 'TAG_CLOSE'
  | 'TAG_SELF_CLOSE'
  | 'CONTROL_FLOW_START'
  | 'CONTROL_FLOW_CHAIN'
  | 'CONTROL_FLOW_END';

interface Token {
  type: TokenType;
  content: string;
}

/**
 * Finds the index of the balanced closing parenthesis starting at startIndex (which must be '(')
 */
function findClosingParen(str: string, startIndex: number): number {
  let depth = 0;
  let inString: string | null = null;

  for (let idx = startIndex; idx < str.length; idx++) {
    const ch = str[idx];

    if (inString) {
      if (ch === inString && str[idx - 1] !== '\\') {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return idx;
      }
    }
  }

  return -1;
}

/**
 * Tokenizes an Angora HTML + Control Flow template
 */
export function tokenizeTemplate(template: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = template.length;

  while (i < len) {
    // 1. Comments <!-- ... -->
    if (template.startsWith('<!--', i)) {
      const end = template.indexOf('-->', i);
      if (end === -1) {
        tokens.push({ type: 'COMMENT', content: template.slice(i) });
        break;
      }
      tokens.push({ type: 'COMMENT', content: template.slice(i, end + 3) });
      i = end + 3;
      continue;
    }

    // 2. Interpolations {{ ... }}
    if (template.startsWith('{{', i)) {
      const end = template.indexOf('}}', i);
      if (end === -1) {
        tokens.push({ type: 'TEXT', content: template.slice(i) });
        break;
      }
      const rawExpr = template.slice(i + 2, end).trim();
      tokens.push({ type: 'INTERPOLATION', content: `{{ ${rawExpr} }}` });
      i = end + 2;
      continue;
    }

    // 3. Control flow chained blocks: } @else if (...) {, } @else {, } @empty {, } @placeholder {, } @loading {, } @error {
    const rest = template.slice(i);
    const chainPrefixMatch = rest.match(
      /^(\}\s*)?@(else\s+if|else|empty|placeholder|loading|error)\b/
    );
    if (chainPrefixMatch) {
      const keyword = chainPrefixMatch[2];
      let cursor = i + chainPrefixMatch[0].length;

      // Skip whitespace
      while (cursor < len && /\s/.test(template[cursor])) cursor++;

      let conditionStr = '';
      if (template[cursor] === '(') {
        const closeParen = findClosingParen(template, cursor);
        if (closeParen !== -1) {
          conditionStr = ' ' + template.slice(cursor, closeParen + 1).trim();
          cursor = closeParen + 1;
        }
      }

      while (cursor < len && /\s/.test(template[cursor])) cursor++;
      if (template[cursor] === '{') {
        cursor++;
        tokens.push({
          type: 'CONTROL_FLOW_CHAIN',
          content: `} @${keyword}${conditionStr} {`,
        });
        i = cursor;
        continue;
      }
    }

    // 4. Control flow start blocks: @if, @for, @switch, @case, @default, @defer, @placeholder, @loading, @error
    const startPrefixMatch = rest.match(
      /^@(if|for|switch|case|default|defer|placeholder|loading|error)\b/
    );
    if (startPrefixMatch) {
      const keyword = startPrefixMatch[1];
      let cursor = i + startPrefixMatch[0].length;

      // Skip whitespace
      while (cursor < len && /\s/.test(template[cursor])) cursor++;

      let conditionStr = '';
      if (template[cursor] === '(') {
        const closeParen = findClosingParen(template, cursor);
        if (closeParen !== -1) {
          conditionStr = ' ' + template.slice(cursor, closeParen + 1).trim();
          cursor = closeParen + 1;
        }
      }

      while (cursor < len && /\s/.test(template[cursor])) cursor++;
      if (template[cursor] === '{') {
        cursor++;
        tokens.push({
          type: 'CONTROL_FLOW_START',
          content: `@${keyword}${conditionStr} {`,
        });
        i = cursor;
        continue;
      }
    }

    // 5. Control flow closing brace: }
    if (template[i] === '}') {
      tokens.push({ type: 'CONTROL_FLOW_END', content: '}' });
      i++;
      continue;
    }

    // 6. HTML Closing tag </tag>
    if (template.startsWith('</', i)) {
      const end = template.indexOf('>', i);
      if (end === -1) {
        tokens.push({ type: 'TEXT', content: template.slice(i) });
        break;
      }
      tokens.push({ type: 'TAG_CLOSE', content: template.slice(i, end + 1) });
      i = end + 1;
      continue;
    }

    // 7. HTML Opening tag or Self-closing tag <tag ...> or <tag ... />
    if (template[i] === '<' && i + 1 < len && /[a-zA-Z0-9!-]/.test(template[i + 1])) {
      let inQuote = false;
      let quoteChar = '';
      let end = -1;
      for (let j = i + 1; j < len; j++) {
        const c = template[j];
        if (inQuote) {
          if (c === quoteChar) {
            inQuote = false;
          }
        } else if (c === '"' || c === "'") {
          inQuote = true;
          quoteChar = c;
        } else if (c === '>') {
          end = j;
          break;
        }
      }
      if (end === -1) {
        tokens.push({ type: 'TEXT', content: template.slice(i) });
        break;
      }

      const rawTag = template.slice(i, end + 1);
      const isSelfClosing =
        rawTag.endsWith('/>') ||
        /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b[^>]*>/i.test(
          rawTag
        );

      tokens.push({
        type: isSelfClosing ? 'TAG_SELF_CLOSE' : 'TAG_OPEN',
        content: normalizeTag(rawTag),
      });
      i = end + 1;
      continue;
    }

    // 8. Plain text between tags or control blocks
    // Search strictly starting from i + 1 so we never loop at the same index
    let nextSpecial = len;
    const candidates = ['<', '{{', '@', '}'];
    for (const c of candidates) {
      const idx = template.indexOf(c, i + 1);
      if (idx !== -1 && idx < nextSpecial) {
        nextSpecial = idx;
      }
    }

    const rawText = template.slice(i, nextSpecial);
    if (rawText.trim().length > 0) {
      tokens.push({ type: 'TEXT', content: rawText.trim() });
    }
    i = nextSpecial;
  }

  return tokens;
}

/**
 * Normalizes attributes inside a tag with clean spacing
 */
function normalizeTag(rawTag: string): string {
  const isSlashEnd = rawTag.endsWith('/>');
  const inner = rawTag.slice(1, isSlashEnd ? -2 : -1).trim();
  const match = inner.match(/^([a-zA-Z0-9_-]+)([\s\S]*)$/);
  if (!match) return rawTag;

  const tagName = match[1];
  const restAttrs = match[2].trim();
  if (!restAttrs) {
    return isSlashEnd ? `<${tagName} />` : `<${tagName}>`;
  }

  const attrs: string[] = [];
  let inQuote = false;
  let quoteChar = '';
  let current = '';

  for (let j = 0; j < restAttrs.length; j++) {
    const c = restAttrs[j];
    if (inQuote) {
      current += c;
      if (c === quoteChar) {
        inQuote = false;
      }
    } else if (c === '"' || c === "'") {
      inQuote = true;
      quoteChar = c;
      current += c;
    } else if (/\s/.test(c)) {
      if (current.trim()) {
        attrs.push(current.trim());
        current = '';
      }
    } else {
      current += c;
    }
  }
  if (current.trim()) {
    attrs.push(current.trim());
  }

  const attrsStr = attrs.join(' ');
  return isSlashEnd ? `<${tagName} ${attrsStr} />` : `<${tagName} ${attrsStr}>`;
}

/**
 * Formats Angora template string with proper indentation and block nesting
 */
export function formatAngoraTemplate(template: string, options: FormatterOptions = {}): string {
  const tabWidth = options.tabWidth ?? 2;
  const indentStr = options.useTabs ? '\t' : ' '.repeat(tabWidth);

  const tokens = tokenizeTemplate(template);
  const lines: string[] = [];
  let currentIndent = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'CONTROL_FLOW_START': {
        lines.push(indentStr.repeat(currentIndent) + token.content);
        currentIndent++;
        break;
      }
      case 'CONTROL_FLOW_CHAIN': {
        currentIndent = Math.max(0, currentIndent - 1);
        lines.push(indentStr.repeat(currentIndent) + token.content);
        currentIndent++;
        break;
      }
      case 'CONTROL_FLOW_END': {
        currentIndent = Math.max(0, currentIndent - 1);
        lines.push(indentStr.repeat(currentIndent) + token.content);
        break;
      }
      case 'TAG_OPEN': {
        lines.push(indentStr.repeat(currentIndent) + token.content);
        currentIndent++;
        break;
      }
      case 'TAG_CLOSE': {
        currentIndent = Math.max(0, currentIndent - 1);
        lines.push(indentStr.repeat(currentIndent) + token.content);
        break;
      }
      case 'TAG_SELF_CLOSE':
      case 'COMMENT': {
        lines.push(indentStr.repeat(currentIndent) + token.content);
        break;
      }
      case 'INTERPOLATION':
      case 'TEXT': {
        lines.push(indentStr.repeat(currentIndent) + token.content);
        break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Formats all inline templates found inside @Component decorators in a TypeScript file
 */
export function formatComponentTemplate(
  sourceCode: string,
  options: FormatterOptions = {}
): string {
  const componentPattern =
    /@Component\s*\(\s*\{([\s\S]*?template\s*:\s*`)([\s\S]*?)(`[\s\S]*?)\}\s*\)/g;

  return sourceCode.replace(componentPattern, (match, prefix, rawTemplate, suffix) => {
    const formattedTmpl = formatAngoraTemplate(rawTemplate, options);
    const baseIndent = ' '.repeat(options.tabWidth ?? 2).repeat(2);
    const indented = formattedTmpl
      .split('\n')
      .map(line => (line.trim() ? baseIndent + line : ''))
      .join('\n');

    return `${prefix}\n${indented}\n  ${suffix}`;
  });
}
