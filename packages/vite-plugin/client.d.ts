/// <reference types="vite/client" />

declare module '*.angora' {
  import type { ComponentType } from '@angora-js/core';
  const component: ComponentType<any>;
  export default component;
}

declare module '*.ag' {
  import type { ComponentType } from '@angora-js/core';
  const component: ComponentType<any>;
  export default component;
}

declare module '*.css' {
  const css: string;
  export default css;
}

declare module '*.scss' {
  const scss: string;
  export default scss;
}
