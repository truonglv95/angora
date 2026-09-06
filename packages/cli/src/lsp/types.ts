export interface LspPosition {
  /** 0-indexed line number */
  line: number;
  /** 0-indexed character offset within the line */
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspDiagnostic {
  range: LspRange;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  code?: string;
  source?: string;
}

export interface LspHover {
  contents: string;
  range?: LspRange;
}

export interface LspDefinition {
  uri: string;
  range: LspRange;
  symbol?: string;
}

export interface LspCompletion {
  label: string;
  kind: 'Keyword' | 'Snippet' | 'Function' | 'Property' | 'Method' | 'Class' | 'Variable';
  detail: string;
  insertText: string;
  documentation?: string;
  sortText?: string;
}

export interface PropertyInfo {
  name: string;
  rawType: string;
  unwrappedType: string;
  isSignal: boolean;
  isComputed: boolean;
  isInput?: boolean;
  isOutput?: boolean;
  isRequired?: boolean;
  isModel?: boolean;
  isMethod: boolean;
  docstring?: string;
  range: LspRange;
}

export interface MethodInfo {
  name: string;
  signature: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
  docstring: string;
  range: LspRange;
}

export interface ImportInfo {
  name: string;
  modulePath: string;
  range: LspRange;
}

export interface ComponentTemplate {
  content: string;
  offset: number;
  range: LspRange;
}

export interface TypeMemberInfo {
  name: string;
  type: string;
  rawType: string;
  unwrappedType?: string;
  isSignal?: boolean;
  isMethod?: boolean;
  signature?: string;
  docstring?: string;
  range?: LspRange;
  uri?: string;
}

export interface TypeDefInfo {
  name: string;
  kind: 'class' | 'interface' | 'type' | 'pipe' | 'directive' | 'component';
  rawType?: string;
  superClass?: string;
  properties: Map<string, TypeMemberInfo>;
  methods: Map<string, TypeMemberInfo>;
  range?: LspRange;
  uri?: string;
}

export interface ComponentAnalysis {
  className: string;
  classRange: LspRange;
  classDoc: string;
  fileUri?: string;
  selector?: string;
  imports: ImportInfo[];
  componentImports?: string[];
  properties: Map<string, PropertyInfo>;
  methods: Map<string, MethodInfo>;
  template?: ComponentTemplate;
}
