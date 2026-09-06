import { signal, Injectable, type WritableSignal, type Signal } from '@angora-js/core';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  duration?: number;
  type?: ToastType;
}

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts: WritableSignal<ToastItem[]> = signal<ToastItem[]>([]);
  public toasts: Signal<ToastItem[]> = this._toasts;

  get lastMessage(): string {
    const list = this._toasts();
    return list.length > 0 ? list[list.length - 1].message : '';
  }

  get isEmpty(): boolean {
    return this._toasts().length === 0;
  }

  private counter = 0;

  show(message: string, options?: ToastOptions): string {
    const id = `toast-${++this.counter}`;
    const type: ToastType = options?.type || 'info';
    const duration = options?.duration !== undefined ? options.duration : 3000;

    const item: ToastItem = { id, message, type, duration };
    this._toasts.update(list => [...list, item]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }

    return id;
  }

  success(message: string, duration?: number): string {
    return this.show(message, { type: 'success', duration });
  }

  error(message: string, duration?: number): string {
    return this.show(message, { type: 'error', duration });
  }

  warning(message: string, duration?: number): string {
    return this.show(message, { type: 'warning', duration });
  }

  info(message: string, duration?: number): string {
    return this.show(message, { type: 'info', duration });
  }

  dismiss(id: string): void {
    this._toasts.update(list => list.filter(t => t.id !== id));
  }

  clear(): void {
    this._toasts.set([]);
  }
}

export { ToastService as AngoraToastService };
