export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface HttpRequestInit {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  body?: any;
  signal?: AbortSignal;
}

export interface HttpRequest<T = any> {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  body?: T;
  signal?: AbortSignal;
}

export interface HttpResponse<T = any> {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers;
  body: T;
}

export interface HttpHandler {
  handle(req: HttpRequest): Promise<HttpResponse>;
}

export interface HttpInterceptor {
  intercept(req: HttpRequest, next: HttpHandler): Promise<HttpResponse>;
}
