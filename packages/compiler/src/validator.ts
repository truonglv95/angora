import type {
  ASTNode,
  ElementNode,
  InterpolationNode,
  IfBlockNode,
  ForBlockNode,
  SwitchBlockNode,
  DeferBlockNode,
} from './ast.ts';

export interface TemplateDiagnostic {
  code: 'NG8001' | 'NG8002' | 'NG8004';
  message: string;
  severity: 'error' | 'warning';
  node?: ASTNode;
}

export interface VerificationOptions {
  className?: string;
  imports?: string[];
  schema?: 'DEFAULT' | 'CUSTOM_ELEMENTS';
}

const STANDARD_HTML_TAGS = new Set([
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'bdi',
  'bdo',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'map',
  'mark',
  'menu',
  'meta',
  'meter',
  'nav',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'picture',
  'portal',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'script',
  'search',
  'section',
  'select',
  'slot',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
]);

const STANDARD_SVG_TAGS = new Set([
  'svg',
  'animate',
  'animateMotion',
  'animateTransform',
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
  'filter',
  'foreignObject',
  'g',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'metadata',
  'mpath',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'set',
  'stop',
  'switch',
  'symbol',
  'text',
  'textPath',
  'tspan',
  'use',
  'view',
]);

const FRAMEWORK_SPECIAL_TAGS = new Set(['ng-content', 'ng-container', 'ng-template']);

const BUILTIN_PIPES = new Set([
  'uppercase',
  'lowercase',
  'json',
  'date',
  'currency',
  'slice',
  'async',
]);

const STANDARD_HTML_PROPERTIES = new Set([
  'id',
  'class',
  'style',
  'title',
  'hidden',
  'tabindex',
  'role',
  'disabled',
  'value',
  'type',
  'name',
  'checked',
  'selected',
  'readonly',
  'required',
  'placeholder',
  'href',
  'target',
  'src',
  'alt',
  'width',
  'height',
  'rows',
  'cols',
  'autocomplete',
  'autofocus',
  'multiple',
  'pattern',
  'min',
  'max',
  'step',
  'for',
  'action',
  'method',
  'enctype',
  'rel',
  'download',
  'media',
  'sizes',
  'srcset',
]);

/**
 * Normalizes a kebab-case or camelCase name into lowercase tokens
 */
function toTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[-_]/)
    .filter(Boolean);
}

/**
 * Checks if a given tag matches an imported symbol
 * e.g. <todo-item> matches TodoItem, TodoItemComponent, TodoItemDirective
 */
function matchesImportedElement(tag: string, importName: string): boolean {
  const tagTokens = toTokens(tag);
  const importTokens = toTokens(importName);

  // If import ends with Component or Directive or Module, strip it for matching
  const strippedImportTokens = importTokens.filter(
    t => t !== 'component' && t !== 'directive' && t !== 'module'
  );

  // Exact match
  if (tagTokens.join('') === importTokens.join('')) return true;
  if (tagTokens.join('') === strippedImportTokens.join('')) return true;

  // Subsequence match: e.g. tag 'app-user-card' matches 'UserCardComponent' or 'AppUserCardComponent'
  const tagStr = tagTokens.join('');
  const importStr = strippedImportTokens.join('');
  if (importStr.length > 0 && (tagStr.includes(importStr) || importStr.includes(tagStr)))
    return true;

  return false;
}

/**
 * Checks if a given pipe matches an imported symbol
 * e.g. pipe 'customDate' matches CustomDatePipe, DatePipe, CustomDate
 */
function matchesImportedPipe(pipeName: string, importName: string): boolean {
  const normPipe = pipeName.toLowerCase();
  const normImport = importName.toLowerCase();

  // If CommonModule is imported, it provides all standard Angular/Angora pipes
  if (normImport === 'commonmodule' && BUILTIN_PIPES.has(normPipe)) {
    return true;
  }

  const pipeTokens = toTokens(pipeName);
  const importTokens = toTokens(importName);

  const strippedImportTokens = importTokens.filter(t => t !== 'pipe' && t !== 'module');

  if (pipeTokens.join('') === importTokens.join('')) return true;
  if (strippedImportTokens.length > 0 && pipeTokens.join('') === strippedImportTokens.join(''))
    return true;

  const pipeStr = pipeTokens.join('');
  const strippedStr = strippedImportTokens.join('');
  if (strippedStr.length > 0 && (pipeStr.includes(strippedStr) || strippedStr.includes(pipeStr))) {
    return true;
  }

  return false;
}

/**
 * Checks if a given property or attribute matches an imported directive
 * e.g. [angoraTooltip] matches TooltipDirective, AngoraTooltipDirective
 */
function matchesImportedDirective(propName: string, importName: string): boolean {
  const propTokens = toTokens(propName);
  const importTokens = toTokens(importName);

  const strippedImportTokens = importTokens.filter(
    t => t !== 'directive' && t !== 'component' && t !== 'module'
  );

  if (propTokens.join('') === importTokens.join('')) return true;
  if (strippedImportTokens.length > 0 && propTokens.join('') === strippedImportTokens.join(''))
    return true;

  const propStr = propTokens.join('');
  const importStr = strippedImportTokens.join('');
  if (importStr.length > 0 && (propStr.includes(importStr) || importStr.includes(propStr)))
    return true;

  return false;
}

/**
 * Scans an expression string for pipes e.g. "value | myPipe:arg1 | otherPipe"
 */
function extractPipesFromExpression(expr: string): string[] {
  const pipes: string[] = [];
  let inQuote: string | null = null;
  let parenDepth = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    const prev = expr[i - 1];

    if (inQuote) {
      if (ch === inQuote && prev !== '\\') inQuote = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') inQuote = ch;
      else if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === '|' && parenDepth === 0) {
        if (expr[i + 1] !== '|' && prev !== '|') {
          // Pipe boundary detected
          const rest = expr.slice(i + 1).trim();
          const pipeMatch = rest.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
          if (pipeMatch) {
            pipes.push(pipeMatch[1]);
          }
        }
      }
    }
  }

  return pipes;
}

function cleanImportSymbol(imp: string): string {
  const trimmed = imp.trim();
  const m = trimmed.match(/forwardRef\s*\(\s*(?:\(\)\s*=>\s*)?([A-Za-z0-9_$]+)\s*\)/);
  if (m) return m[1];
  return trimmed;
}

/**
 * Verifies that all elements, pipes, and directives used in a component template
 * are properly declared in the component's `imports` array.
 */
export function verifyTemplateImports(
  ast: ASTNode[],
  options: VerificationOptions = {}
): TemplateDiagnostic[] {
  const diagnostics: TemplateDiagnostic[] = [];
  const className = options.className || 'Component';
  const rawImports = options.imports || [];
  const imports = rawImports.map(cleanImportSymbol).filter(Boolean);
  const isCustomElementsSchema = options.schema === 'CUSTOM_ELEMENTS';

  function verifyExpressionPipes(expr: string, node: ASTNode) {
    const usedPipes = extractPipesFromExpression(expr);
    for (const pipeName of usedPipes) {
      const isImported = imports.some(imp => matchesImportedPipe(pipeName, imp));
      if (!isImported) {
        diagnostics.push({
          code: 'NG8004',
          severity: 'error',
          message: `No pipe found with name '${pipeName}'. Verify that it is included in the '@Component.imports' of '${className}'.`,
          node,
        });
      }
    }
  }

  function walk(node: ASTNode) {
    switch (node.type) {
      case 'element': {
        const tag = node.name.toLowerCase();

        // 1. Verify Element Tag
        if (
          !STANDARD_HTML_TAGS.has(tag) &&
          !STANDARD_SVG_TAGS.has(tag) &&
          !FRAMEWORK_SPECIAL_TAGS.has(tag)
        ) {
          if (!isCustomElementsSchema) {
            const isImported = imports.some(imp => matchesImportedElement(tag, imp));
            if (!isImported) {
              diagnostics.push({
                code: 'NG8001',
                severity: 'error',
                message: `'${node.name}' is not a known element:\n1. If '${node.name}' is an Angora component, verify that it is included in the '@Component.imports' of '${className}'.\n2. If '${node.name}' is a Web Component, declare CUSTOM_ELEMENTS_SCHEMA.`,
                node,
              });
            }
          }
        }

        // 2. Verify Property Bindings & Directives
        for (const prop of node.properties) {
          verifyExpressionPipes(prop.expression, node);

          const propName = prop.name;
          const isStandardModifier =
            propName.startsWith('class.') ||
            propName.startsWith('style.') ||
            propName.startsWith('attr.') ||
            STANDARD_HTML_PROPERTIES.has(propName);

          // If not standard HTML property and not standard modifier, check if it's a directive or component input
          if (!isStandardModifier) {
            const isImportedDirectiveOrComp = imports.some(
              imp => matchesImportedDirective(propName, imp) || matchesImportedElement(tag, imp)
            );
            if (!isImportedDirectiveOrComp && STANDARD_HTML_TAGS.has(tag)) {
              diagnostics.push({
                code: 'NG8002',
                severity: 'warning',
                message: `Can't bind to '${propName}' since it isn't a known property of '<${node.name}>' and no matching directive was found in imports of '${className}'.`,
                node,
              });
            }
          }
        }

        // 3. Verify Two-Way Bindings
        for (const twoWay of node.twoWayBindings) {
          verifyExpressionPipes(twoWay.expression, node);
        }

        // 4. Verify Event Bindings
        for (const ev of node.events) {
          verifyExpressionPipes(ev.handler, node);
        }

        // Recurse children
        for (const child of node.children) {
          walk(child);
        }
        break;
      }

      case 'interpolation': {
        verifyExpressionPipes(node.expression, node);
        break;
      }

      case 'ifBlock': {
        for (const branch of node.branches) {
          if (branch.condition) {
            verifyExpressionPipes(branch.condition, node);
          }
          for (const child of branch.children) {
            walk(child);
          }
        }
        break;
      }

      case 'forBlock': {
        verifyExpressionPipes(node.iterable, node);
        verifyExpressionPipes(node.trackBy, node);
        for (const child of node.children) {
          walk(child);
        }
        if (node.emptyChildren) {
          for (const child of node.emptyChildren) {
            walk(child);
          }
        }
        break;
      }

      case 'switchBlock': {
        verifyExpressionPipes(node.expression, node);
        for (const c of node.cases) {
          if (c.caseValue) {
            verifyExpressionPipes(c.caseValue, node);
          }
          for (const child of c.children) {
            walk(child);
          }
        }
        break;
      }

      case 'deferBlock': {
        if (node.mainBlock) {
          for (const child of node.mainBlock) {
            walk(child);
          }
        }
        if (node.placeholderBlock?.children) {
          for (const child of node.placeholderBlock.children) {
            walk(child);
          }
        }
        if (node.loadingBlock?.children) {
          for (const child of node.loadingBlock.children) {
            walk(child);
          }
        }
        if (node.errorBlock?.children) {
          for (const child of node.errorBlock.children) {
            walk(child);
          }
        }
        break;
      }
    }
  }

  for (const node of ast) {
    walk(node);
  }

  return diagnostics;
}
