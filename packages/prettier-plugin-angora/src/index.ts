import {
  formatAngoraTemplate,
  formatComponentTemplate,
  type FormatterOptions,
} from './formatter.ts';

export { formatAngoraTemplate, formatComponentTemplate, type FormatterOptions };

/**
 * Prettier Plugin definition for Angora template syntax
 */
export const languages = [
  {
    name: 'AngoraTemplate',
    parsers: ['angora-template'],
    extensions: ['.angora', '.angora.html'],
    vscodeLanguageIds: ['html', 'angora-template'],
  },
];

export const parsers = {
  'angora-template': {
    parse(text: string) {
      return {
        type: 'AngoraTemplateDocument',
        body: text,
      };
    },
    astFormat: 'angora-template-ast',
    locStart: () => 0,
    locEnd: (node: any) => node.body?.length ?? 0,
  },
};

export const printers = {
  'angora-template-ast': {
    print(path: any, options: any) {
      const node = path.getValue();
      return formatAngoraTemplate(node.body, {
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        printWidth: options.printWidth,
        singleQuote: options.singleQuote,
      });
    },
  },
};

export default {
  languages,
  parsers,
  printers,
  formatAngoraTemplate,
  formatComponentTemplate,
};
