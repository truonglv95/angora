import type { HttpInterceptor } from './types.ts';
import { HttpClient, HTTP_INTERCEPTORS } from './http-client.ts';

export function provideHttpClient(...interceptors: HttpInterceptor[]) {
  return [
    { provide: HTTP_INTERCEPTORS, useValue: interceptors },
    {
      provide: HttpClient,
      useFactory: () => new HttpClient(interceptors),
    },
  ];
}
