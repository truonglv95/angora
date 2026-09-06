import type { RouteManifestEntry, RouteModule } from './types.ts';

/**
 * Converts a file path into a standardized URL path pattern and regex
 *
 * Example mappings:
 * - "routes/index.ts" -> "/"
 * - "routes/about.ts" -> "/about"
 * - "routes/users/[id].ts" -> "/users/:id"
 * - "routes/posts/[category]/[slug].ts" -> "/posts/:category/:slug"
 * - "routes/[...all].ts" -> "/*"
 */
export function filePathToRoute(filePath: string): {
  path: string;
  pattern: RegExp;
  paramNames: string[];
} {
  // Strip leading directory and file extension
  let normalized = filePath
    .replace(/^.*routes\/?/, '')
    .replace(/\.(ts|js|tsx|jsx)$/, '')
    .replace(/\/index$/, '')
    .replace(/^index$/, '');

  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (normalized === '') {
    normalized = '/';
  }

  // Extract params
  const paramNames: string[] = [];
  const segments = normalized.split('/').filter(Boolean);

  const patternSegments = segments.map(seg => {
    if (seg.startsWith('[...') && seg.endsWith(']')) {
      const name = seg.slice(4, -1);
      paramNames.push(name);
      return '(.*)';
    }
    if (seg.startsWith('[') && seg.endsWith(']')) {
      const name = seg.slice(1, -1);
      paramNames.push(name);
      return '([^/]+)';
    }
    return seg;
  });

  const regexStr = '^/' + patternSegments.join('/') + '/?$';
  const pattern = new RegExp(regexStr);

  // Clean path format e.g. /users/:id
  const routePath =
    '/' +
    segments
      .map(seg => {
        if (seg.startsWith('[...') && seg.endsWith(']')) return '*';
        if (seg.startsWith('[') && seg.endsWith(']')) return ':' + seg.slice(1, -1);
        return seg;
      })
      .join('/');

  return {
    path: routePath || '/',
    pattern,
    paramNames,
  };
}

/**
 * Compiles a dictionary of route modules (e.g. from import.meta.glob) into a RouteManifest
 */
export function createRouteManifest(moduleMap: Record<string, RouteModule>): RouteManifestEntry[] {
  const entries: RouteManifestEntry[] = [];

  for (const [filePath, module] of Object.entries(moduleMap)) {
    const { path, pattern, paramNames } = filePathToRoute(filePath);
    entries.push({
      path,
      filePath,
      pattern,
      paramNames,
      module,
    });
  }

  // Sort routes: static paths first, parameterized paths second, catchall last
  entries.sort((a, b) => {
    const aIsCatchall = a.path.includes('*');
    const bIsCatchall = b.path.includes('*');
    if (aIsCatchall && !bIsCatchall) return 1;
    if (!aIsCatchall && bIsCatchall) return -1;

    const aParamCount = a.paramNames.length;
    const bParamCount = b.paramNames.length;
    if (aParamCount !== bParamCount) return aParamCount - bParamCount;

    return b.path.length - a.path.length;
  });

  return entries;
}

/**
 * Matches a request pathname against the route manifest
 */
export function matchRoute(
  manifest: RouteManifestEntry[],
  pathname: string
): { entry: RouteManifestEntry; params: Record<string, string> } | null {
  const cleanPath = pathname.replace(/\/$/, '') || '/';

  for (const entry of manifest) {
    const match = cleanPath.match(entry.pattern);
    if (match) {
      const params: Record<string, string> = {};
      for (let i = 0; i < entry.paramNames.length; i++) {
        params[entry.paramNames[i]] = decodeURIComponent(match[i + 1] || '');
      }
      return { entry, params };
    }
  }

  return null;
}
