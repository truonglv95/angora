import { InjectionToken } from '@angora-js/core';
import type {
  HttpMethod,
  HttpRequest,
  HttpRequestInit,
  HttpResponse,
  HttpHandler,
  HttpInterceptor,
} from './types.ts';

export const HTTP_INTERCEPTORS = new InjectionToken<HttpInterceptor[]>('HttpInterceptors', {
  factory: () => [],
});

class FetchBackendHandler implements HttpHandler {
  async handle(req: HttpRequest): Promise<HttpResponse> {
    let finalUrl = req.url;

    // Append query params if present
    if (req.params && Object.keys(req.params).length > 0) {
      const urlObj = new URL(req.url, 'http://localhost');
      for (const [key, val] of Object.entries(req.params)) {
        urlObj.searchParams.set(key, String(val));
      }
      finalUrl = req.url.startsWith('http')
        ? urlObj.toString()
        : `${urlObj.pathname}${urlObj.search}`;
    }

    const headers = new Headers(req.headers);
    let body: any = req.body;

    if (
      body !== undefined &&
      typeof body === 'object' &&
      !(body instanceof FormData) &&
      !(body instanceof Blob)
    ) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      body = JSON.stringify(body);
    }

    const res = await fetch(finalUrl, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      signal: req.signal,
    });

    const contentType = res.headers.get('Content-Type') || '';
    let parsedBody: any;

    if (contentType.includes('application/json')) {
      parsedBody = await res.json();
    } else {
      parsedBody = await res.text();
    }

    return {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: res.headers,
      body: parsedBody,
    };
  }
}

export class HttpClient {
  private handler: HttpHandler;

  constructor(interceptors: HttpInterceptor[] = []) {
    const backend = new FetchBackendHandler();

    // Build interceptor pipeline from end to beginning
    this.handler = interceptors.reduceRight<HttpHandler>(
      (next, interceptor) => ({
        handle: req => interceptor.intercept(req, next),
      }),
      backend
    );
  }

  public async request<T = any>(
    method: HttpMethod,
    url: string,
    options: HttpRequestInit = {}
  ): Promise<HttpResponse<T>> {
    const req: HttpRequest = {
      url,
      method,
      headers: options.headers || {},
      params: options.params,
      body: options.body,
      signal: options.signal,
    };

    const response = await this.handler.handle(req);
    if (!response.ok) {
      const error = new Error(`HTTP Error ${response.status}: ${response.statusText}`) as any;
      error.response = response;
      error.status = response.status;
      throw error;
    }
    return response as HttpResponse<T>;
  }

  public async get<T = any>(url: string, options?: HttpRequestInit): Promise<T> {
    const res = await this.request<T>('GET', url, options);
    return res.body;
  }

  public async post<T = any>(url: string, body?: any, options?: HttpRequestInit): Promise<T> {
    const res = await this.request<T>('POST', url, { ...options, body });
    return res.body;
  }

  public async put<T = any>(url: string, body?: any, options?: HttpRequestInit): Promise<T> {
    const res = await this.request<T>('PUT', url, { ...options, body });
    return res.body;
  }

  public async delete<T = any>(url: string, options?: HttpRequestInit): Promise<T> {
    const res = await this.request<T>('DELETE', url, options);
    return res.body;
  }

  public async patch<T = any>(url: string, body?: any, options?: HttpRequestInit): Promise<T> {
    const res = await this.request<T>('PATCH', url, { ...options, body });
    return res.body;
  }
}
