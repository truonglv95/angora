import { signal, Injector, rootInjector, type Type } from '@angora-js/core';
import { bootstrapApplication } from '@angora-js/runtime';

export interface DialogConfig<D = any> {
  data?: D;
  width?: string;
  closeOnBackdrop?: boolean;
}

export class DialogRef<T = any, R = any> {
  public componentInstance!: T;
  public afterClosed = signal<R | undefined>(undefined);
  private containerEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.containerEl = container;
  }

  close(result?: R) {
    this.afterClosed.set(result);
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl);
      this.containerEl = null;
    }
  }
}

/**
 * Angular-style programmatic Dialog service (analogous to MatDialog / cdkDialog)
 *
 * @example
 * const dialogService = inject(DialogService);
 * const dialogRef = dialogService.open(ConfirmModalComponent, { data: { message: 'Are you sure?' } });
 * effect(() => {
 *   const result = dialogRef.afterClosed();
 *   if (result) console.log('Confirmed!');
 * });
 */
export class DialogService {
  open<T, D = any, R = any>(componentType: Type<T>, config: DialogConfig<D> = {}): DialogRef<T, R> {
    const container = document.createElement('div');
    container.className = 'angora-dialog-overlay';
    document.body.appendChild(container);

    const dialogRef = new DialogRef<T, R>(container);

    const providers = [
      { provide: DialogRef, useValue: dialogRef },
      ...(config.data ? [{ provide: 'DIALOG_DATA', useValue: config.data }] : []),
    ];

    const instance = bootstrapApplication(componentType, container, {
      providers,
    });

    dialogRef.componentInstance = instance;
    return dialogRef;
  }
}
