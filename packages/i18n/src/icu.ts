import type { TranslationParams } from './types.ts';

/**
 * Formats an ICU MessageFormat string with parameters, plurals, and select conditionals.
 * @example
 * formatIcuMessage('{count, plural, =0 {No apples} one {# apple} other {# apples}}', { count: 3 })
 * // "3 apples"
 */
export function formatIcuMessage(
  template: string,
  params: TranslationParams = {},
  locale: string = 'en'
): string {
  if (!template || !template.includes('{')) {
    return template;
  }

  let result = '';
  let i = 0;

  while (i < template.length) {
    if (template[i] === '{') {
      const closing = findMatchingBrace(template, i);
      if (closing === -1) {
        result += template[i];
        i++;
        continue;
      }

      const content = template.slice(i + 1, closing).trim();
      const firstComma = content.indexOf(',');

      if (firstComma === -1) {
        // Simple parameter interpolation: {name}
        const val = params[content];
        result += val !== undefined ? String(val) : `{${content}}`;
      } else {
        const varName = content.slice(0, firstComma).trim();
        const rest = content.slice(firstComma + 1).trim();
        const secondComma = rest.indexOf(',');

        if (secondComma === -1) {
          result += `{${content}}`;
        } else {
          const formatType = rest.slice(0, secondComma).trim().toLowerCase();
          const subCasesRaw = rest.slice(secondComma + 1).trim();

          if (formatType === 'plural') {
            const num = Number(params[varName] ?? 0);
            result += resolvePlural(num, subCasesRaw, params, locale);
          } else if (formatType === 'select') {
            const key = String(params[varName] ?? '');
            result += resolveSelect(key, subCasesRaw, params, locale);
          } else {
            result += `{${content}}`;
          }
        }
      }

      i = closing + 1;
    } else {
      result += template[i];
      i++;
    }
  }

  return result;
}

function findMatchingBrace(str: string, startIndex: number): number {
  let depth = 0;
  for (let i = startIndex; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseSubCases(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;

    let key = '';
    while (i < raw.length && !/\s|{/.test(raw[i])) {
      key += raw[i];
      i++;
    }

    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i < raw.length && raw[i] === '{') {
      const closing = findMatchingBrace(raw, i);
      if (closing !== -1) {
        const body = raw.slice(i + 1, closing);
        map.set(key, body);
        i = closing + 1;
      } else {
        break;
      }
    } else {
      i++;
    }
  }
  return map;
}

function resolvePlural(
  count: number,
  casesRaw: string,
  params: TranslationParams,
  locale: string
): string {
  const cases = parseSubCases(casesRaw);
  const exactKey = `=${count}`;

  let chosen = '';
  if (cases.has(exactKey)) {
    chosen = cases.get(exactKey)!;
  } else {
    try {
      const pr = new Intl.PluralRules(locale);
      const category = pr.select(count);
      if (cases.has(category)) {
        chosen = cases.get(category)!;
      } else if (cases.has('other')) {
        chosen = cases.get('other')!;
      }
    } catch {
      chosen = cases.get('other') || '';
    }
  }

  const withCount = chosen.replace(/#/g, String(count));
  return formatIcuMessage(withCount, params, locale);
}

function resolveSelect(
  val: string,
  casesRaw: string,
  params: TranslationParams,
  locale: string
): string {
  const cases = parseSubCases(casesRaw);
  let chosen = cases.get(val);
  if (!chosen && cases.has('other')) {
    chosen = cases.get('other')!;
  }
  if (!chosen) return '';
  return formatIcuMessage(chosen, params, locale);
}
