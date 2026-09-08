import { signal, computed, effect, type WritableSignal, type Signal } from '@angora-js/core';
import type { ValidatorFn, AsyncValidatorFn, ValidationErrors } from './validators.ts';
import type { AbstractControl, FormControlStatus } from './types.ts';

export interface FormArrayOptions {
  validators?: ValidatorFn[];
  asyncValidators?: AsyncValidatorFn[];
}

export class FormArray<
  TControl extends AbstractControl<any> = AbstractControl<any>,
> implements AbstractControl<any[]> {
  private _controls: WritableSignal<TControl[]>;
  private validatorList: ValidatorFn[];
  private asyncValidatorList: AsyncValidatorFn[];
  private asyncRunId = 0;

  private asyncErrors: WritableSignal<ValidationErrors | null>;
  private asyncStatus: WritableSignal<FormControlStatus>;

  public controls: Signal<TControl[]>;
  public length: Signal<number>;
  public value: Signal<any[]>;
  public rawValue: Signal<any[]>;
  public valid: Signal<boolean>;
  public invalid: Signal<boolean>;
  public pending: Signal<boolean>;
  public dirty: Signal<boolean>;
  public touched: Signal<boolean>;
  public pristine: Signal<boolean>;
  public untouched: Signal<boolean>;
  public disabled: Signal<boolean>;
  public enabled: Signal<boolean>;
  public errors: Signal<ValidationErrors | null>;
  public status: Signal<FormControlStatus>;

  constructor(initialControls: TControl[] = [], options?: FormArrayOptions | ValidatorFn[]) {
    if (Array.isArray(options)) {
      this.validatorList = options;
      this.asyncValidatorList = [];
    } else {
      this.validatorList = options?.validators || [];
      this.asyncValidatorList = options?.asyncValidators || [];
    }

    this._controls = signal<TControl[]>(initialControls);
    this.controls = computed(() => this._controls());
    this.length = computed(() => this._controls().length);

    this.rawValue = computed(() => {
      return this._controls().map(c =>
        typeof (c as any).getRawValue === 'function' ? (c as any).getRawValue() : c.value()
      );
    });

    this.value = computed(() => {
      return this._controls()
        .filter(c => c.status?.() !== 'DISABLED')
        .map(c => c.value());
    });

    this.asyncErrors = signal<ValidationErrors | null>(null);
    this.asyncStatus = signal<FormControlStatus>(
      this.asyncValidatorList.length > 0 ? 'PENDING' : 'VALID'
    );

    const syncErrors = computed(() => {
      const val = this.value();
      let combined: ValidationErrors | null = null;
      for (const validator of this.validatorList) {
        const res = validator(val);
        if (res) {
          combined = { ...(combined || {}), ...res };
        }
      }
      return combined;
    });

    this.errors = computed(() => {
      const selfErrors: ValidationErrors = {};
      const sync = syncErrors();
      const async = this.asyncErrors();
      if (sync) Object.assign(selfErrors, sync);
      if (async) Object.assign(selfErrors, async);

      const childErrors: Record<number, ValidationErrors> = {};
      const ctrls = this._controls();
      let hasChildErrors = false;
      for (let i = 0; i < ctrls.length; i++) {
        const err = ctrls[i].errors();
        if (err) {
          childErrors[i] = err;
          hasChildErrors = true;
        }
      }

      if (Object.keys(selfErrors).length === 0 && !hasChildErrors) {
        return null;
      }

      return {
        ...(Object.keys(selfErrors).length > 0 ? selfErrors : {}),
        ...(hasChildErrors ? { children: childErrors } : {}),
      };
    });

    this.status = computed(() => {
      const ctrls = this._controls();
      if (ctrls.length > 0 && ctrls.every(c => c.status?.() === 'DISABLED')) {
        return 'DISABLED';
      }
      for (const c of ctrls) {
        if (c.status?.() === 'PENDING' || c.pending?.()) {
          return 'PENDING';
        }
      }
      if (this.asyncValidatorList.length > 0 && this.asyncStatus() === 'PENDING') {
        return 'PENDING';
      }

      if (syncErrors() !== null) return 'INVALID';

      for (const c of ctrls) {
        if (c.status?.() !== 'DISABLED' && c.invalid()) return 'INVALID';
      }

      if (this.asyncValidatorList.length > 0) return this.asyncStatus();
      return 'VALID';
    });

    this.valid = computed(() => this.status() === 'VALID' || this.status() === 'DISABLED');
    this.invalid = computed(() => this.status() === 'INVALID');
    this.pending = computed(() => this.status() === 'PENDING');
    this.disabled = computed(() => this.status() === 'DISABLED');
    this.enabled = computed(() => !this.disabled());

    this.dirty = computed(() => {
      return this._controls().some(c => c.dirty());
    });
    this.pristine = computed(() => !this.dirty());

    this.touched = computed(() => {
      return this._controls().some(c => c.touched());
    });
    this.untouched = computed(() => !this.touched());

    // Async validation
    if (this.asyncValidatorList.length > 0) {
      effect(() => {
        const val = this.value();
        const sync = syncErrors();
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

  public at(index: number): TControl | undefined {
    return this._controls()[index];
  }

  public push(control: TControl): void {
    this._controls.update(list => [...list, control]);
  }

  public insert(index: number, control: TControl): void {
    this._controls.update(list => {
      const next = [...list];
      next.splice(index, 0, control);
      return next;
    });
  }

  public removeAt(index: number): void {
    this._controls.update(list => {
      const next = [...list];
      next.splice(index, 1);
      return next;
    });
  }

  public setControl(index: number, control: TControl): void {
    this._controls.update(list => {
      const next = [...list];
      next[index] = control;
      return next;
    });
  }

  public clear(): void {
    this._controls.set([]);
  }

  public reset(values?: any[]): void {
    const ctrls = this._controls();
    ctrls.forEach((ctrl, i) => {
      ctrl.reset(values ? values[i] : undefined);
    });
  }

  public patchValue(values: any[]): void {
    if (!Array.isArray(values)) return;
    const ctrls = this._controls();
    values.forEach((val, i) => {
      if (ctrls[i]) {
        ctrls[i].patchValue(val);
      }
    });
  }

  public setValue(values: any[]): void {
    if (!Array.isArray(values)) return;
    const ctrls = this._controls();
    values.forEach((val, i) => {
      if (ctrls[i]) {
        if (typeof ctrls[i].setValue === 'function') {
          ctrls[i].setValue!(val);
        } else {
          ctrls[i].patchValue(val);
        }
      }
    });
  }

  public markAsDirty(): void {
    this._controls().forEach(c => c.markAsDirty());
  }

  public markAsPristine(): void {
    this._controls().forEach(c => c.markAsPristine());
  }

  public markAsTouched(): void {
    this._controls().forEach(c => c.markAsTouched());
  }

  public markAllAsTouched(): void {
    this.markAsTouched();
    this._controls().forEach(c => {
      if (typeof (c as any).markAllAsTouched === 'function') {
        (c as any).markAllAsTouched();
      } else if (typeof c.markAsTouched === 'function') {
        c.markAsTouched();
      }
    });
  }

  public markAsUntouched(): void {
    this._controls().forEach(c => c.markAsUntouched());
  }

  public disable(): void {
    this._controls().forEach(c => c.disable?.());
  }

  public enable(): void {
    this._controls().forEach(c => c.enable?.());
  }

  public getRawValue(): any[] {
    return this.rawValue();
  }
}
