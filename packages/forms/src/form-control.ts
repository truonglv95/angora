import { signal, computed, effect, type WritableSignal, type Signal } from '@angora-js/core';
import type { ValidatorFn, AsyncValidatorFn, ValidationErrors } from './validators.ts';
import type { AbstractControl, FormControlStatus } from './types.ts';

export interface FormControlOptions {
  validators?: ValidatorFn[];
  asyncValidators?: AsyncValidatorFn[];
  nonNullable?: boolean;
}

export class FormControl<T = any> implements AbstractControl<T> {
  private initialValue: T;
  private validatorList: ValidatorFn[];
  private asyncValidatorList: AsyncValidatorFn[];
  private asyncRunId = 0;

  public value: WritableSignal<T>;
  public dirty: WritableSignal<boolean>;
  public touched: WritableSignal<boolean>;

  private syncErrors: Signal<ValidationErrors | null>;
  private asyncErrors: WritableSignal<ValidationErrors | null>;
  private asyncStatus: WritableSignal<FormControlStatus>;

  public errors: Signal<ValidationErrors | null>;
  public status: Signal<FormControlStatus>;
  public valid: Signal<boolean>;
  public invalid: Signal<boolean>;
  public pending: Signal<boolean>;
  public pristine: Signal<boolean>;
  public untouched: Signal<boolean>;

  constructor(
    initialValue: T,
    validatorOrOpts?: FormControlOptions | ValidatorFn | ValidatorFn[],
    asyncValidator?: AsyncValidatorFn | AsyncValidatorFn[]
  ) {
    this.initialValue = initialValue;

    if (Array.isArray(validatorOrOpts)) {
      this.validatorList = validatorOrOpts;
      this.asyncValidatorList = Array.isArray(asyncValidator)
        ? asyncValidator
        : asyncValidator
          ? [asyncValidator]
          : [];
    } else if (typeof validatorOrOpts === 'function') {
      this.validatorList = [validatorOrOpts];
      this.asyncValidatorList = Array.isArray(asyncValidator)
        ? asyncValidator
        : asyncValidator
          ? [asyncValidator]
          : [];
    } else {
      this.validatorList = validatorOrOpts?.validators || [];
      this.asyncValidatorList =
        validatorOrOpts?.asyncValidators ||
        (Array.isArray(asyncValidator) ? asyncValidator : asyncValidator ? [asyncValidator] : []);
    }

    this.value = signal<T>(initialValue);
    this.dirty = signal<boolean>(false);
    this.touched = signal<boolean>(false);
    this.asyncErrors = signal<ValidationErrors | null>(null);
    this.asyncStatus = signal<FormControlStatus>(
      this.asyncValidatorList.length > 0 ? 'PENDING' : 'VALID'
    );

    this.syncErrors = computed(() => {
      const val = this.value();
      let combinedErrors: ValidationErrors | null = null;

      for (const validator of this.validatorList) {
        const res = validator(val);
        if (res) {
          combinedErrors = { ...(combinedErrors || {}), ...res };
        }
      }
      return combinedErrors;
    });

    this.errors = computed(() => {
      const s = this.syncErrors();
      const a = this.asyncErrors();
      if (!s && !a) return null;
      return { ...(s || {}), ...(a || {}) };
    });

    this.status = computed(() => {
      if (this.syncErrors() !== null) return 'INVALID';
      if (this.asyncValidatorList.length > 0) return this.asyncStatus();
      return 'VALID';
    });

    this.valid = computed(() => this.status() === 'VALID');
    this.invalid = computed(() => this.status() === 'INVALID');
    this.pending = computed(() => this.status() === 'PENDING');
    this.pristine = computed(() => !this.dirty());
    this.untouched = computed(() => !this.touched());

    // Trigger async validation on value changes
    if (this.asyncValidatorList.length > 0) {
      effect(() => {
        const val = this.value();
        const sync = this.syncErrors();
        if (sync !== null) {
          this.asyncStatus.set('INVALID');
          this.asyncErrors.set(null);
          return;
        }

        this.asyncStatus.set('PENDING');
        const currentRunId = ++this.asyncRunId;

        Promise.all(this.asyncValidatorList.map(fn => fn(val)))
          .then(results => {
            if (currentRunId !== this.asyncRunId) return;
            let combined: ValidationErrors | null = null;
            for (const res of results) {
              if (res) combined = { ...(combined || {}), ...res };
            }
            this.asyncErrors.set(combined);
            this.asyncStatus.set(combined ? 'INVALID' : 'VALID');
          })
          .catch(err => {
            if (currentRunId !== this.asyncRunId) return;
            this.asyncErrors.set({ asyncError: err });
            this.asyncStatus.set('INVALID');
          });
      });
    }
  }

  public setValue(newValue: T): void {
    this.value.set(newValue);
    this.dirty.set(true);
  }

  public set(newValue: T): void {
    this.setValue(newValue);
  }

  public update(fn: (prev: T) => T): void {
    this.setValue(fn(this.value()));
  }

  public patchValue(newValue: Partial<T>): void {
    if (typeof newValue === 'object' && newValue !== null && typeof this.value() === 'object') {
      this.setValue({ ...this.value(), ...newValue } as T);
    } else {
      this.setValue(newValue as T);
    }
  }

  public reset(resetValue?: T): void {
    this.value.set(resetValue !== undefined ? resetValue : this.initialValue);
    this.dirty.set(false);
    this.touched.set(false);
  }

  public markAsDirty(): void {
    this.dirty.set(true);
  }

  public markAsPristine(): void {
    this.dirty.set(false);
  }

  public markAsTouched(): void {
    this.touched.set(true);
  }

  public markAsUntouched(): void {
    this.touched.set(false);
  }

  public setValidators(validators: ValidatorFn[]): void {
    this.validatorList = validators;
    // Trigger recomputation of errors
    this.value.update(v => v);
  }

  public hasError(errorCode: string): boolean {
    const errs = this.errors();
    return errs !== null && errorCode in errs;
  }

  public getError(errorCode: string): any {
    const errs = this.errors();
    return errs ? errs[errorCode] : undefined;
  }
}
