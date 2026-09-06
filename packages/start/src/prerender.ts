import { renderToString } from '@angora-js/server';

/**
 * Pre-renders a list of routes to static HTML for Static Site Generation (SSG)
 */
export async function prerenderRoutes(
  rootComponent: any,
  routes: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const route of routes) {
    const { html, stateScript, stylesHtml } = await renderToString(rootComponent, {
      url: route,
    });

    result[route] = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${stylesHtml}
  </head>
  <body>
    <div id="app">${html}</div>
    ${stateScript}
  </body>
</html>`;
  }

  return result;
}
