import type { ServerFunction } from './types.ts';

const serverFunctionRegistry = new Map<string, ServerFunction<any, any>>();

/**
 * Creates an end-to-end type-safe Server Function (RPC)
 *
 * When called on the server: executes directly in-memory.
 * When called on the client: dispatches a POST request to `/_angora/rpc` and awaits JSON response.
 *
 * @example
 * export const getSecretData = createServerFunction('getSecretData', async (userId: string) => {
 *   return db.users.find({ id: userId });
 * });
 */
export function isServerEnvironment(): boolean {
  if (typeof window !== 'undefined' && (window as any).__MOCK_CLIENT_ENV__) {
    return false;
  }
  return (
    typeof process !== 'undefined' &&
    Boolean(process.versions?.node || (process.versions as any)?.bun)
  );
}

export function createServerFunction<TArgs, TResult>(
  id: string,
  handler: (args: TArgs, req: Request) => Promise<TResult> | TResult
): ServerFunction<TArgs, TResult> {
  const fn: ServerFunction<TArgs, TResult> = Object.assign(
    async (args: TArgs): Promise<TResult> => {
      // Check if we are in a server runtime environment
      if (isServerEnvironment()) {
        const dummyReq = new Request('http://localhost/_angora/rpc');
        return handler(args, dummyReq);
      }

      // We are in client browser environment -> make HTTP RPC call

      const response = await fetch('/_angora/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, args }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `Server Function "${id}" failed.`);
      }

      const json = await response.json();
      return json.result as TResult;
    },
    {
      id,
      isServerFunction: true as const,
      handler,
    }
  );

  serverFunctionRegistry.set(id, fn);
  return fn;
}

let autoIdCounter = 0;

/**
 * Creates an end-to-end type-safe Server Function (RPC)
 * Supports both `server$(async () => {})` and `server$('customId', async () => {})`.
 */
export function server$<TArgs, TResult>(
  idOrHandler: string | ((args: TArgs, req: Request) => Promise<TResult> | TResult),
  maybeHandler?: (args: TArgs, req: Request) => Promise<TResult> | TResult
): ServerFunction<TArgs, TResult> {
  if (typeof idOrHandler === 'string') {
    return createServerFunction(idOrHandler, maybeHandler!);
  }
  const autoId = `fn_${++autoIdCounter}_${idOrHandler.name || 'anonymous'}`;
  return createServerFunction(autoId, idOrHandler);
}

export const createServerAction = createServerFunction;
export const createServerLoader = createServerFunction;

/**
 * Invokes a registered server function by ID with given arguments and incoming Request
 */
export async function executeServerFunction(id: string, args: any, req: Request): Promise<any> {
  const fn = serverFunctionRegistry.get(id);
  if (!fn) {
    throw new Error(`[Angora Start] Server function "${id}" not found.`);
  }
  return fn.handler(args, req);
}

export function getServerFunction(id: string): ServerFunction<any, any> | undefined {
  return serverFunctionRegistry.get(id);
}
