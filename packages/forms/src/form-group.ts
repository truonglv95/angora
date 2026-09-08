import { computed, signal, type Signal, type WritableSignal } from '@angora-js/core';
import type { ValidationErrors } from './validators.ts';
import type { AbstractControl, FormControlStatus } from './types.ts';

export type ControlsOf<T> = {
  [K in keyof T]: AbstractControl<T[K]> | any;
};

export type GroupValidatorFn<T extends Record<string, any> = Record<string, any>> = (
  group: FormGroup<T>
) => ValidationErrors | null;

export interface FormGroupOptions<T extends Record<string, any> = Record<string, any>> {
  validators?: GroupValidatorFn<T>[];
}

export class FormGroup<
  T extends Record<string, any> = Record<string, any>,
> implements AbstractControl<T> {
  private _controls: WritableSignal<Record<string, AbstractControl<any>>>;
  private groupValidators: GroupValidatorFn<T>[];

  public controls: Record<string, AbstractControl<any>>;
  public value: Signal<T>;
  public rawValue: Signal<T>;
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

  constructor(
    initialControls: ControlsOf<T>,
    options?: FormGroupOptions<T> | GroupValidatorFn<T>[]
  ) {
    this._controls = signal<Record<string, AbstractControl<any>>>({ ...initialControls });
    this.controls = initialControls as any;
    this.groupValidators = Array.isArray(options) ? options : options?.validators || [];

    for (const key of Object.keys(initialControls)) {
      if (!(key in this)) {
        Object.defineProperty(this, key, {
          get: () => (this.controls as any)[key],
          set: (val: any) => (this.controls as any)[key]?.setValue(val),
          configurable: true,
          enumerable: true,
        });
      }
    }

    this.rawValue = computed(() => {
      const ctrls = this._controls();
      const val = {} as T;
      for (const [key, ctrl] of Object.entries(ctrls)) {
        (val as any)[key] =
          typeof (ctrl as any).getRawValue === 'function'
            ? (ctrl as any).getRawValue()
            : ctrl.value();
      }
      return val;
    });

    this.value = computed(() => {
      const ctrls = this._controls();
      const val = {} as T;
      for (const [key, ctrl] of Object.entries(ctrls)) {
        if (ctrl.status?.() !== 'DISABLED') {
          (val as any)[key] = ctrl.value();
        }
      }
      return val;
    });

    this.errors = computed(() => {
      let combined: ValidationErrors | null = null;
      for (const [key, ctrl] of Object.entries(this._controls())) {
        if (ctrl.status?.() !== 'DISABLED') {
          const errs = ctrl.errors();
          if (errs) {
            combined = { ...(combined || {}), [key]: errs };
          }
        }
      }
      for (const validator of this.groupValidators) {
        const res = validator(this);
        if (res) {
          combined = { ...(combined || {}), ...res };
        }
      }
      return combined;
    });

    this.status = computed(() => {
      const ctrls = Object.values(this._controls());
      if (ctrls.length > 0 && ctrls.every(c => c.status?.() === 'DISABLED')) {
        return 'DISABLED';
      }
      for (const ctrl of ctrls) {
        if (ctrl.status?.() === 'PENDING' || ctrl.pending?.()) {
          return 'PENDING';
        }
      }
      for (const ctrl of ctrls) {
        if (ctrl.status?.() !== 'DISABLED' && ctrl.invalid()) {
          return 'INVALID';
        }
      }
      if (this.errors() !== null) {
        return 'INVALID';
      }
      return 'VALID';
    });

    this.valid = computed(() => this.status() === 'VALID' || this.status() === 'DISABLED');
    this.invalid = computed(() => this.status() === 'INVALID');
    this.pending = computed(() => this.status() === 'PENDING');
    this.disabled = computed(() => this.status() === 'DISABLED');
    this.enabled = computed(() => !this.disabled());

    this.dirty = computed(() => {
      return Object.values(this._controls()).some(ctrl => ctrl.dirty());
    });
    this.pristine = computed(() => !this.dirty());

    this.touched = computed(() => {
      return Object.values(this._controls()).some(ctrl => ctrl.touched());
    });
    this.untouched = computed(() => !this.touched());
  }

  public get<K extends keyof T>(name: K): ControlsOf<T>[K] {
    return this._controls()[name as string] as any;
  }

  public addControl(name: string, control: AbstractControl<any>): void {
    this._controls.update(ctrls => ({ ...ctrls, [name]: control }));
    (this.controls as any)[name] = control;
    if (!(name in this)) {
      Object.defineProperty(this, name, {
        get: () => (this.controls as any)[name],
        set: (val: any) => (this.controls as any)[name]?.setValue(val),
        configurable: true,
        enumerable: true,
      });
    }
  }

  public removeControl(name: string): void {
    this._controls.update(ctrls => {
      const next = { ...ctrls };
      delete next[name];
      return next;
    });
    delete (this.controls as any)[name];
    delete (this as any)[name];
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

  public disable(): void {
    Object.values(this._controls()).forEach(c => c.disable?.());
  }

  public enable(): void {
    Object.values(this._controls()).forEach(c => c.enable?.());
  }

  public getRawValue(): T {
    return this.rawValue();
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

/**
 * FormRecord allows tracking a dynamic collection of controls of the same type.
 * Useful for dynamic dictionaries or toggle lists with runtime-added keys.
 */
export class FormRecord<
  TControl extends AbstractControl<any> = AbstractControl<any>,
> extends FormGroup<Record<string, any>> {
  constructor(
    initialControls: Record<string, TControl> = {},
    options?: FormGroupOptions<Record<string, any>>
  ) {
    super(initialControls as any, options);
  }
}
