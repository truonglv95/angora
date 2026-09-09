import type { AbstractControl } from './types.ts';
import { FormControl } from './form-control.ts';
import {
  FormGroup,
  FormRecord,
  type FormGroupOptions,
  type GroupValidatorFn,
} from './form-group.ts';
import { FormArray } from './form-array.ts';
import type { ValidatorFn, AsyncValidatorFn, ValidationErrors } from './validators.ts';
import { bindControl } from './directives.ts';

export type FormFieldDef<T = any> =
  | AbstractControl<T>
  | [T, (ValidatorFn | ValidatorFn[])?, (AsyncValidatorFn | AsyncValidatorFn[])?]
  | T;

export type FormFieldConfig<T> =
  | AbstractControl<T>
  | [T, (ValidatorFn | ValidatorFn[])?, (AsyncValidatorFn | AsyncValidatorFn[])?]
  | [T, ...any[]]
  | (T extends any[] ? never : T);

/**
 * Strictly-typed configuration matching an explicit model TModel.
 */
export type FormConfig<TModel> = {
  [K in keyof TModel]: TModel[K] extends Array<infer Item>
    ? FormArray<AbstractControl<Item>> | Item[] | FormFieldConfig<Item[]>
    : TModel[K] extends Record<string, any>
      ? FormConfig<TModel[K]> | FormGroup<TModel[K]>
      : FormFieldConfig<TModel[K]>;
};

export type FormValidator =
  | ValidatorFn
  | ValidatorFn[]
  | AsyncValidatorFn
  | AsyncValidatorFn[]
  | readonly ValidatorFn[];

export type ExtractFormValue<Item> = Exclude<Item, FormValidator>;

export type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends bigint
        ? bigint
        : T extends symbol
          ? symbol
          : T;

export type InferFieldModel<T> =
  T extends AbstractControl<infer V>
    ? V
    : T extends readonly [infer V, ...any[]]
      ? Widen<V>
      : T extends [infer V, ...any[]]
        ? Widen<V>
        : T extends Array<infer Item>
          ? [ExtractFormValue<Item>] extends [never]
            ? any[]
            : [Item] extends [ExtractFormValue<Item>]
              ? Widen<Item>[]
              : Widen<ExtractFormValue<Item>>
          : T extends Record<string, any>
            ? InferFormModel<T>
            : Widen<T>;

export type InferFormModel<TConfig> = {
  -readonly [K in keyof TConfig]: InferFieldModel<TConfig[K]>;
};

/**
 * Strictly-typed child controls mapping for a given model TModel.
 */
export type TypedControls<TModel> = {
  readonly [K in keyof TModel]: [TModel[K]] extends [Array<infer Item>]
    ? FormArray<AbstractControl<Item>>
    : [TModel[K]] extends [Record<string, any>]
      ? TypedFormGroup<TModel[K]>
      : FormControl<TModel[K]>;
};

/**
 * Complete strictly-typed FormGroup with direct property access and signal-based state.
 */
export type TypedFormGroup<TModel extends Record<string, any>> = FormGroup<TModel> &
  TypedControls<TModel>;

export interface FormOptions<TModel extends Record<string, any> = Record<string, any>> {
  validators?: Array<(group: TypedFormGroup<TModel>) => ValidationErrors | null>;
}

/**
 * Creates a standalone FormControl with optional validators.
 * Shortcut for `new FormControl(initialValue, validators)`.
 */
export function control<T = any>(
  initialValue: T,
  validators?: ValidatorFn | ValidatorFn[],
  asyncValidators?: AsyncValidatorFn | AsyncValidatorFn[]
): FormControl<T> {
  return new FormControl(initialValue, validators, asyncValidators);
}

/**
 * Creates a FormArray from a list of controls or values.
 * Shortcut for `new FormArray([...])`.
 */
export function formArray<T = any>(
  items: Array<
    | AbstractControl<T>
    | [T, (ValidatorFn | ValidatorFn[])?, (AsyncValidatorFn | AsyncValidatorFn[])?]
    | T
  >
): FormArray<AbstractControl<any>> {
  const controls: Array<AbstractControl<any>> = items.map(c => {
    if (c && typeof c === 'object' && 'value' in c && typeof (c as any).value === 'function') {
      return c as AbstractControl<any>;
    }
    if (Array.isArray(c) && c.length >= 2 && (typeof c[1] === 'function' || Array.isArray(c[1]))) {
      return new FormControl(c[0], c[1], c[2]);
    }
    return new FormControl(c);
  });
  return new FormArray(controls);
}

/**
 * Inference-First (Bottom-Up): Type Inferred from Config
 * e.g. `const loginForm = form({ email: ['', required], password: '' });`
 */
export function form<TConfig extends Record<string, any>>(
  config: TConfig,
  options?: FormOptions<InferFormModel<TConfig>>
): TypedFormGroup<InferFormModel<TConfig>>;

/**
 * Model-First (Top-Down): Explicit Generic Model
 * e.g. `const userForm = form<UserProfile>({ name: ['', required], age: 18 });`
 */
export function form<TModel extends Record<string, any>>(
  config: FormConfig<TModel>,
  options?: FormOptions<TModel>
): TypedFormGroup<TModel>;

/**
 * Ultra-lean signal form builder factory.
 * Automatically wraps values and validator tuples into FormControls/FormGroups,
 * and returns a proxy that provides direct, type-safe property access.
 */
export function form(config: Record<string, any>, options?: FormOptions<any>): any {
  const controls: Record<string, AbstractControl<any>> = {};

  for (const [key, def] of Object.entries(config)) {
    if (
      def &&
      typeof def === 'object' &&
      'value' in def &&
      typeof (def as any).value === 'function'
    ) {
      controls[key] = def as AbstractControl<any>;
    } else if (Array.isArray(def)) {
      if (def.length >= 2 && (typeof def[1] === 'function' || Array.isArray(def[1]))) {
        controls[key] = new FormControl(def[0], def[1], def[2]);
      } else {
        controls[key] = new FormControl(def);
      }
    } else if (def && typeof def === 'object' && !Array.isArray(def)) {
      controls[key] = form(def);
    } else {
      controls[key] = new FormControl(def);
    }
  }

  const group = new FormGroup(controls, options as any);

  return new Proxy(group, {
    get(target: any, prop: string | symbol, receiver: any) {
      if (typeof prop === 'string' && !(prop in target) && prop in target.controls) {
        return target.controls[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target: any, prop: string | symbol, value: any, receiver: any) {
      if (typeof prop === 'string' && !(prop in target) && prop in target.controls) {
        target.controls[prop].setValue(value);
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });
}

/**
 * Creates a strictly-typed FormRecord for dynamic dictionary-style controls.
 * Useful for toggle lists or dynamic properties with runtime keys.
 */
export function formRecord<TValue = any>(
  initialControls: Record<string, FormFieldDef<TValue>> = {},
  options?: FormOptions<Record<string, TValue>>
): FormRecord<FormControl<TValue>> & Record<string, FormControl<TValue>> {
  const controls: Record<string, AbstractControl<TValue>> = {};

  for (const [key, def] of Object.entries(initialControls)) {
    if (
      def &&
      typeof def === 'object' &&
      'value' in def &&
      typeof (def as any).value === 'function'
    ) {
      controls[key] = def as AbstractControl<TValue>;
    } else if (Array.isArray(def)) {
      if (def.length >= 2 && (typeof def[1] === 'function' || Array.isArray(def[1]))) {
        controls[key] = new FormControl(def[0], def[1], def[2]);
      } else {
        controls[key] = new FormControl(def as any);
      }
    } else {
      controls[key] = new FormControl(def as any);
    }
  }

  const record = new FormRecord<FormControl<TValue>>(controls as any, options as any);

  return new Proxy(record, {
    get(target: any, prop: string | symbol, receiver: any) {
      if (typeof prop === 'string' && !(prop in target) && prop in target.controls) {
        return target.controls[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target: any, prop: string | symbol, value: any, receiver: any) {
      if (typeof prop === 'string' && !(prop in target) && prop in target.controls) {
        target.controls[prop].setValue(value);
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  }) as any;
}

/**
 * Binds an entire HTMLFormElement to an Angora FormGroup.
 * Automatically wires all matching inputs/selects/textareas by `name`,
 * updates validation CSS classes, intercepts form submit with markAllAsTouched,
 * and invokes `onSubmit` with reactive values when valid.
 */
export function bindForm(
  formElement: HTMLFormElement,
  formGroup: FormGroup<any>,
  onSubmit?: (values: any) => void
): () => void {
  const unbindFns: Array<() => void> = [];

  const inputs = formElement.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >('input[name], textarea[name], select[name]');

  inputs.forEach(el => {
    const name = el.getAttribute('name');
    if (name && formGroup.controls[name] instanceof FormControl) {
      unbindFns.push(bindControl(el, formGroup.controls[name] as FormControl));
    }
  });

  const submitHandler = (e: Event) => {
    e.preventDefault();
    formGroup.markAllAsTouched();
    if (formGroup.valid() && onSubmit) {
      onSubmit(formGroup.value());
    }
  };

  formElement.addEventListener('submit', submitHandler);

  return () => {
    formElement.removeEventListener('submit', submitHandler);
    unbindFns.forEach(fn => fn());
  };
}
