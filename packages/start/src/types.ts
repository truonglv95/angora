export interface LoaderContext {
  params: Record<string, string>;
  request: Request;
  url: URL;
}

export interface ActionContext {
  params: Record<string, string>;
  request: Request;
  body: any;
}

export interface RouteModule {
  default: any; // Component
  loader?: (ctx: LoaderContext) => Promise<any> | any;
  action?: (ctx: ActionContext) => Promise<any> | any;
}

export interface RouteManifestEntry {
  path: string;
  filePath: string;
  pattern: RegExp;
  paramNames: string[];
  module: RouteModule;
}

export type ServerFunction<TArgs, TResult> = {
  (args: TArgs): Promise<TResult>;
  readonly id: string;
  readonly isServerFunction: true;
  handler: (args: TArgs, req: Request) => Promise<TResult> | TResult;
};

export interface StartHandlerOptions {
  manifest: RouteManifestEntry[];
  rootComponent: any;
  documentTemplate?: (content: { shell: string; styles: string; state: string }) => string;
}
