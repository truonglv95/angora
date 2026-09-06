import { effect } from '@angora-js/core';
import type { FormControl } from './form-control.ts';

export function bindControl(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  control: FormControl
): () => void {
  // Sync control value -> DOM element
  const stopValueSync = effect(() => {
    const val = control.value();
    if (element.type === 'checkbox') {
      (element as HTMLInputElement).checked = Boolean(val);
    } else {
      if (element.value !== (val ?? '')) {
        element.value = val ?? '';
      }
    }
  });

  // Sync control state -> CSS classes on DOM element
  const stopClassSync = effect(() => {
    element.classList.toggle('ng-valid', control.valid());
    element.classList.toggle('ng-invalid', control.invalid());
    element.classList.toggle('ng-dirty', control.dirty());
    element.classList.toggle('ng-pristine', control.pristine());
    element.classList.toggle('ng-touched', control.touched());
    element.classList.toggle('ng-untouched', control.untouched());
  });

  // DOM element input -> control value
  const onInput = () => {
    let newVal: any = element.value;
    if (element.type === 'checkbox') {
      newVal = (element as HTMLInputElement).checked;
    } else if (element.type === 'number') {
      newVal = element.value === '' ? null : Number(element.value);
    }
    control.setValue(newVal);
  };

  // DOM element blur -> mark as touched
  const onBlur = () => {
    control.markAsTouched();
  };

  const inputEvent =
    element.tagName === 'SELECT' || element.type === 'checkbox' || element.type === 'radio'
      ? 'change'
      : 'input';
  element.addEventListener(inputEvent, onInput);
  element.addEventListener('blur', onBlur);

  return () => {
    stopValueSync();
    stopClassSync();
    element.removeEventListener(inputEvent, onInput);
    element.removeEventListener('blur', onBlur);
  };
}
