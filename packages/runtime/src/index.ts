import * as domExports from './dom.ts';
import * as controlFlowExports from './control-flow.ts';
import * as bootstrapExports from './bootstrap.ts';
import * as mountExports from './mount.ts';
import * as stylesExports from './styles.ts';
import * as deferExports from './defer.ts';
import * as pipesExports from './pipes.ts';
import * as directivesExports from './directives.ts';
import * as errorBoundaryExports from './error-boundary.ts';
import * as devtoolsExports from './devtools.ts';
import * as inspectorExports from './inspector.ts';
import * as hmrExports from './hmr.ts';

export * from './dom.ts';
export * from './control-flow.ts';
export * from './bootstrap.ts';
export * from './mount.ts';
export * from './styles.ts';
export * from './defer.ts';
export * from './pipes.ts';
export * from './directives.ts';
export * from './error-boundary.ts';
export * from './devtools.ts';
export * from './inspector.ts';
export * from './hmr.ts';
export * from './dynamic.ts';
export { COMPONENT_DEF } from '@angora-js/core';

const runtimeScope = {
  ...domExports,
  ...controlFlowExports,
  ...bootstrapExports,
  ...mountExports,
  ...stylesExports,
  ...deferExports,
  ...pipesExports,
  ...directivesExports,
  ...errorBoundaryExports,
  ...devtoolsExports,
  ...inspectorExports,
  ...hmrExports,
};

(globalThis as any).__ANGORA_RUNTIME__ = runtimeScope;
