import { effect, type Signal } from '@angora-js/core';

export interface ObservableSubscription {
  unsubscribe: () => void;
  closed?: boolean;
}

export interface Observer<T> {
  next?: (value: T) => void;
  error?: (err: any) => void;
  complete?: () => void;
}

export interface Observable<T> {
  subscribe(observerOrNext: Observer<T> | ((value: T) => void)): ObservableSubscription;
}

/**
 * Transforms an Angora Signal into an RxJS Observable stream.
 * Automatically synchronizes signal emissions with subscribers via reactive effects.
 */
export function toObservable<T>(sig: Signal<T>): Observable<T> {
  return {
    subscribe(observerOrNext: Observer<T> | ((value: T) => void)): ObservableSubscription {
      const observer: Observer<T> =
        typeof observerOrNext === 'function' ? { next: observerOrNext } : observerOrNext;

      let isUnsubscribed = false;

      const stopEffect = effect(() => {
        const val = sig();
        if (!isUnsubscribed && observer.next) {
          observer.next(val);
        }
      });

      return {
        unsubscribe() {
          if (isUnsubscribed) return;
          isUnsubscribed = true;
          stopEffect();
          if (observer.complete) {
            observer.complete();
          }
        },
        get closed() {
          return isUnsubscribed;
        },
      };
    },
  };
}
