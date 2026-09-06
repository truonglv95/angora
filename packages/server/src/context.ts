import { InjectionToken } from '@angora-js/core';

export interface ServerContext {
  url: string;
  params?: Record<string, string>;
  statusCode?: number;
  headers?: Record<string, string>;
}

export const SERVER_CONTEXT = new InjectionToken<ServerContext>('ServerContext');

export class TransferState {
  private store = new Map<string, any>();

  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.store.has(key) ? this.store.get(key) : defaultValue;
  }

  public set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  public has(key: string): boolean {
    return this.store.has(key);
  }

  public remove(key: string): void {
    this.store.delete(key);
  }

  public toJson(): string {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.store.entries()) {
      obj[k] = v;
    }
    return JSON.stringify(obj);
  }

  public fromJson(jsonStr: string): void {
    try {
      const parsed = JSON.parse(jsonStr);
      for (const [k, v] of Object.entries(parsed)) {
        this.store.set(k, v);
      }
    } catch (e) {
      console.error('[Angora Server] Failed to deserialize TransferState JSON:', e);
    }
  }
}

export const TRANSFER_STATE = new InjectionToken<TransferState>('TransferState', {
  factory: () => new TransferState(),
});

export function provideServerContext(context: ServerContext) {
  return [
    { provide: SERVER_CONTEXT, useValue: context },
    { provide: TRANSFER_STATE, useClass: TransferState },
  ];
}
