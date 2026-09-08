import type { AbstractControl } from './types.ts';
import { FormControl } from './form-control.ts';
import { FormGroup } from './form-group.ts';
import { FormArray } from './form-array.ts';
import type { ValidatorFn, AsyncValidatorFn } from './validators.ts';
import { bindControl } from './directives.ts';

export type FormFieldDef<T = any> =
  | AbstractControl<T>
  | [T, (ValidatorFn | ValidatorFn[])?, (AsyncValidatorFn | AsyncValidatorFn[])?]
  | T;

export type TypedFormGroup<T extends Record<string, any>> = FormGroup<any> & {
  readonly [K in keyof T]: T[K] extends AbstractControl<any>
    ? T[K]
    : T[K] extends [infer V, ...any[]]
      ? FormControl<V>
      : T[K] extends Record<string, any>
        ? TypedFormGroup<T[K]>
        : FormControl<T[K]>;
};

/**
 * Creates a standalone FormControl with optional validators.
 * Shortcut for \`new FormControl(initialValue, validators)\`.
 */
export function control<T = any>(
  initialValue: T,
  validators?: ValidatorFn | ValidatorFn[],
  asyncValidators?: AsyncValidatorFn | AsyncValidatorFn[]
): FormControl<T> {
  return new FormControl<T>(initialValue, validators, asyncValidators);
}

/**
 * Creates a FormArray from a list of controls or values.
 * Shortcut for \`new FormArray([...])\`.
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
 * Ultra-lean signal form builder factory.
 * Automatically wraps values and validator tuples into FormControls/FormGroups,
 * and returns a proxy that provides direct, type-safe property access.
 *
 * @example
 * \`\`\`ts
 * const loginForm = form({
 *   email: ['', [required, email]],
 *   password: ['', required],
 *   rememberMe: false,
 * });
 *
 * // Direct access:
 * loginForm.email.set('user@example.com');
 * console.log(loginForm.email.value());
 * console.log(loginForm.value()); // { email: 'user@example.com', password: '', rememberMe: false }
 * console.log(loginForm.valid()); // true/false
 * \`\`\`
 */
export function form<T extends Record<string, any>>(config: T): TypedFormGroup<T> {
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

  const group = new FormGroup(controls);

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
  }) as TypedFormGroup<T>;
}

/**
 * Binds an entire HTMLFormElement to an Angora FormGroup.
 * Automatically wires all matching inputs/selects/textareas by \`name\`,
 * updates validation CSS classes, intercepts form submit with markAllAsTouched,
 * and invokes \`onSubmit\` with reactive values when valid.
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
