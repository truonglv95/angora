import { computed, signal, type Signal, type WritableSignal } from '@angora-js/core';
import type { ValidationErrors } from './validators.ts';
import type { AbstractControl, FormControlStatus } from './types.ts';

export type ControlsOf<T> = {
  [K in keyof T]: AbstractControl<T[K]> | any;
};

export class FormGroup<
  T extends Record<string, any> = Record<string, any>,
> implements AbstractControl<T> {
  private _controls: WritableSignal<Record<string, AbstractControl<any>>>;

  public controls: Record<string, AbstractControl<any>>;
  public value: Signal<T>;
  public valid: Signal<boolean>;
  public invalid: Signal<boolean>;
  public pending: Signal<boolean>;
  public dirty: Signal<boolean>;
  public touched: Signal<boolean>;
  public pristine: Signal<boolean>;
  public untouched: Signal<boolean>;
  public errors: Signal<ValidationErrors | null>;
  public status: Signal<FormControlStatus>;

  constructor(initialControls: ControlsOf<T>) {
    this._controls = signal<Record<string, AbstractControl<any>>>({ ...initialControls });
    this.controls = initialControls as any;

    this.value = computed(() => {
      const ctrls = this._controls();
      const val = {} as T;
      for (const [key, ctrl] of Object.entries(ctrls)) {
        (val as any)[key] = ctrl.value();
      }
      return val;
    });

    this.status = computed(() => {
      const ctrls = Object.values(this._controls());
      for (const ctrl of ctrls) {
        if (ctrl.status?.() === 'PENDING' || ctrl.pending?.()) {
          return 'PENDING';
        }
      }
      for (const ctrl of ctrls) {
        if (ctrl.invalid()) {
          return 'INVALID';
        }
      }
      return 'VALID';
    });

    this.valid = computed(() => this.status() === 'VALID');
    this.invalid = computed(() => this.status() === 'INVALID');
    this.pending = computed(() => this.status() === 'PENDING');

    this.dirty = computed(() => {
      return Object.values(this._controls()).some(ctrl => ctrl.dirty());
    });
    this.pristine = computed(() => !this.dirty());

    this.touched = computed(() => {
      return Object.values(this._controls()).some(ctrl => ctrl.touched());
    });
    this.untouched = computed(() => !this.touched());

    this.errors = computed(() => {
      let combined: ValidationErrors | null = null;
      for (const [key, ctrl] of Object.entries(this._controls())) {
        const errs = ctrl.errors();
        if (errs) {
          combined = { ...(combined || {}), [key]: errs };
        }
      }
      return combined;
    });
  }

  public get<K extends keyof T>(name: K): ControlsOf<T>[K] {
    return this._controls()[name as string] as any;
  }

  public addControl(name: string, control: AbstractControl<any>): void {
    this._controls.update(ctrls => ({ ...ctrls, [name]: control }));
    (this.controls as any)[name] = control;
  }

  public removeControl(name: string): void {
    this._controls.update(ctrls => {
      const next = { ...ctrls };
      delete next[name];
      return next;
    });
    delete (this.controls as any)[name];
  }

  public patchValue(values: Partial<T>): void {
    const ctrls = this._controls();
    for (const [key, val] of Object.entries(values)) {
      if (key in ctrls) {
        ctrls[key].patchValue(val);
      }
    }
  }

  public reset(values?: Partial<T>): void {
    const ctrls = this._controls();
    for (const [key, ctrl] of Object.entries(ctrls)) {
      ctrl.reset(values ? (values as any)[key] : undefined);
    }
  }

  public markAsDirty(): void {
    Object.values(this._controls()).forEach(c => c.markAsDirty());
  }

  public markAsPristine(): void {
    Object.values(this._controls()).forEach(c => c.markAsPristine());
  }

  public markAsTouched(): void {
    Object.values(this._controls()).forEach(c => c.markAsTouched());
  }

  public markAllAsTouched(): void {
    this.markAsTouched();
    Object.values(this._controls()).forEach(c => {
      if (typeof (c as any).markAllAsTouched === 'function') {
        (c as any).markAllAsTouched();
      } else if (typeof c.markAsTouched === 'function') {
        c.markAsTouched();
      }
    });
  }

  public markAsUntouched(): void {
    Object.values(this._controls()).forEach(c => c.markAsUntouched());
  }
}
