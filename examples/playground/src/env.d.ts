/// <reference types="vite/client" />
/// <reference types="@angora-js/vite-plugin/client" />

declare module '*.scss' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}
