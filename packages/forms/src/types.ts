import type { Signal } from '@angora-js/core';
import type { ValidationErrors } from './validators.ts';

export type FormControlStatus = 'VALID' | 'INVALID' | 'PENDING' | 'DISABLED';

export interface AbstractControl<T = any> {
  value: Signal<T>;
  rawValue?: Signal<T>;
  valid: Signal<boolean>;
  invalid: Signal<boolean>;
  dirty: Signal<boolean>;
  touched: Signal<boolean>;
  pristine: Signal<boolean>;
  untouched: Signal<boolean>;
  status: Signal<FormControlStatus>;
  errors: Signal<ValidationErrors | null>;
  pending?: Signal<boolean>;
  disabled?: Signal<boolean>;
  enabled?: Signal<boolean>;

  reset(value?: any): void;
  markAsDirty(): void;
  markAsPristine(): void;
  markAsTouched(): void;
  markAsUntouched(): void;
  patchValue(value: any): void;
  setValue?(value: any): void;
  disable?(): void;
  enable?(): void;
  getRawValue?(): T;
  hasError?(errorCode: string): boolean;
  getError?(errorCode: string): any;
}
