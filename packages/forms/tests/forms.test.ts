import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import {
  FormControl,
  FormGroup,
  FormArray,
  Validators,
  bindControl,
  form,
  control,
  formArray,
  bindForm,
  required,
  email,
  minLength,
} from '../src/index.ts';

describe('@angora-js/forms - Reactive Forms Engine', () => {
  let doc: Document;

  beforeEach(() => {
    const window = new Window();
    (global as any).document = window.document;
    (global as any).window = window;
    doc = window.document as any;
  });

  test('should validate FormControl with Validators.required and minLength', () => {
    const nameControl = new FormControl('', [Validators.required, Validators.minLength(3)]);

    expect(nameControl.valid()).toBe(false);
    expect(nameControl.invalid()).toBe(true);
    expect(nameControl.hasError('required')).toBe(true);

    nameControl.setValue('Al');
    expect(nameControl.hasError('required')).toBe(false);
    expect(nameControl.hasError('minlength')).toBe(true);
    expect(nameControl.valid()).toBe(false);

    nameControl.setValue('Angora');
    expect(nameControl.valid()).toBe(true);
    expect(nameControl.invalid()).toBe(false);
    expect(nameControl.errors()).toBeNull();
  });

  test('should track dirty and touched status on FormControl', () => {
    const emailControl = new FormControl('test@example.com', [Validators.email]);

    expect(emailControl.pristine()).toBe(true);
    expect(emailControl.untouched()).toBe(true);

    emailControl.setValue('new@example.com');
    expect(emailControl.dirty()).toBe(true);
    expect(emailControl.pristine()).toBe(false);

    emailControl.markAsTouched();
    expect(emailControl.touched()).toBe(true);
    expect(emailControl.untouched()).toBe(false);

    emailControl.reset();
    expect(emailControl.value()).toBe('test@example.com');
    expect(emailControl.pristine()).toBe(true);
    expect(emailControl.untouched()).toBe(true);
  });

  test('should manage multiple controls in FormGroup', () => {
    const form = new FormGroup({
      username: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      age: new FormControl(18, [Validators.min(18)]),
    });

    expect(form.valid()).toBe(false);
    expect(form.invalid()).toBe(true);
    expect(form.errors()?.username).toEqual({ required: true });

    form.patchValue({
      username: 'alice',
      email: 'alice@example.com',
    });

    expect(form.valid()).toBe(true);
    expect(form.value()).toEqual({
      username: 'alice',
      email: 'alice@example.com',
      age: 18,
    });
  });

  test('should bind FormControl to HTMLInputElement and synchronize state & CSS classes', () => {
    const input = doc.createElement('input') as HTMLInputElement;
    doc.body.appendChild(input);

    const control = new FormControl('', [Validators.required]);
    const unbind = bindControl(input, control);

    // Initial state
    expect(input.value).toBe('');
    expect(input.classList.contains('ng-invalid')).toBe(true);
    expect(input.classList.contains('ng-pristine')).toBe(true);
    expect(input.classList.contains('ng-untouched')).toBe(true);

    // Typing in DOM input
    input.value = 'Hello World';
    input.dispatchEvent(new (window as any).Event('input'));

    expect(control.value()).toBe('Hello World');
    expect(control.dirty()).toBe(true);
    expect(input.classList.contains('ng-valid')).toBe(true);
    expect(input.classList.contains('ng-dirty')).toBe(true);

    // Trigger blur on input
    input.dispatchEvent(new (window as any).Event('blur'));
    expect(control.touched()).toBe(true);
    expect(input.classList.contains('ng-touched')).toBe(true);

    unbind();
  });

  test('should manage dynamic list of controls with FormArray', () => {
    const item1 = new FormControl('Apple', [Validators.required]);
    const item2 = new FormControl('Banana', [Validators.required]);
    const array = new FormArray([item1, item2]);

    expect(array.length()).toBe(2);
    expect(array.value()).toEqual(['Apple', 'Banana']);
    expect(array.valid()).toBe(true);
    expect(array.invalid()).toBe(false);

    // Push new invalid control
    const item3 = new FormControl('', [Validators.required]);
    array.push(item3);
    expect(array.length()).toBe(3);
    expect(array.valid()).toBe(false);
    expect(array.invalid()).toBe(true);

    // Set value on item3 to make array valid
    item3.setValue('Cherry');
    expect(array.valid()).toBe(true);
    expect(array.value()).toEqual(['Apple', 'Banana', 'Cherry']);
    expect(array.dirty()).toBe(true);

    // Remove item at index 1
    array.removeAt(1);
    expect(array.length()).toBe(2);
    expect(array.value()).toEqual(['Apple', 'Cherry']);

    // Insert at index 1
    array.insert(1, new FormControl('Blueberry'));
    expect(array.length()).toBe(3);
    expect(array.value()).toEqual(['Apple', 'Blueberry', 'Cherry']);

    // Clear all
    array.clear();
    expect(array.length()).toBe(0);
    expect(array.value()).toEqual([]);
  });

  test('should support nested FormArray inside FormGroup', () => {
    const orderForm = new FormGroup({
      customer: new FormControl('Acme Corp', [Validators.required]),
      items: new FormArray([
        new FormGroup({
          product: new FormControl('Widget A', [Validators.required]),
          qty: new FormControl(10, [Validators.min(1)]),
        }),
      ]),
    });

    expect(orderForm.valid()).toBe(true);
    expect(orderForm.value()).toEqual({
      customer: 'Acme Corp',
      items: [{ product: 'Widget A', qty: 10 }],
    });

    // Add another item with invalid qty
    const itemsArray = orderForm.get('items') as FormArray;
    itemsArray.push(
      new FormGroup({
        product: new FormControl('Widget B'),
        qty: new FormControl(0, [Validators.min(1)]),
      })
    );

    expect(orderForm.valid()).toBe(false);

    // Fix qty
    const secondGroup = itemsArray.at(1) as FormGroup;
    secondGroup.get('qty').setValue(5);
    expect(orderForm.valid()).toBe(true);
    expect((orderForm.value() as any).items[1].qty).toBe(5);
  });

  test('should support async validators on FormControl', async () => {
    const existingUsernames = ['admin', 'root'];

    const usernameControl = new FormControl('john', {
      validators: [Validators.required],
      asyncValidators: [
        (val: string) =>
          new Promise(resolve => {
            setTimeout(() => {
              if (existingUsernames.includes(val)) {
                resolve({ usernameTaken: true });
              } else {
                resolve(null);
              }
            }, 20);
          }),
      ],
    });

    // Initial check while async validator is running
    expect(usernameControl.pending()).toBe(true);
    expect(usernameControl.status()).toBe('PENDING');

    await new Promise(r => setTimeout(r, 30));

    expect(usernameControl.pending()).toBe(false);
    expect(usernameControl.status()).toBe('VALID');
    expect(usernameControl.valid()).toBe(true);

    // Change to existing username
    usernameControl.setValue('admin');
    expect(usernameControl.pending()).toBe(true);

    await new Promise(r => setTimeout(r, 30));

    expect(usernameControl.pending()).toBe(false);
    expect(usernameControl.status()).toBe('INVALID');
    expect(usernameControl.valid()).toBe(false);
    expect(usernameControl.hasError('usernameTaken')).toBe(true);
  });

  test('form() builder creates ultra-lean forms with direct property access', () => {
    const loginForm = form({
      email: ['', [required, email]],
      password: ['', required],
      rememberMe: false,
    });

    // Check initial state
    expect(loginForm.valid()).toBe(false);
    expect(loginForm.invalid()).toBe(true);
    expect(loginForm.email.valid()).toBe(false);
    expect(loginForm.email.hasError('required')).toBe(true);

    // Direct property setting via .set()
    loginForm.email.set('user@angora.dev');
    loginForm.password.set('secret123');
    loginForm.rememberMe.set(true);

    expect(loginForm.email.valid()).toBe(true);
    expect(loginForm.valid()).toBe(true);
    expect(loginForm.value()).toEqual({
      email: 'user@angora.dev',
      password: 'secret123',
      rememberMe: true,
    });

    // .update() method
    loginForm.email.update(val => val.toUpperCase());
    expect(loginForm.email.value()).toBe('USER@ANGORA.DEV');

    // Reset form
    loginForm.reset();
    expect(loginForm.email.value()).toBe('');
    expect(loginForm.rememberMe.value()).toBe(false);
    expect(loginForm.valid()).toBe(false);
  });

  test('form() builder supports nested groups and formArray()', () => {
    const userProfile = form({
      name: ['', required],
      address: {
        city: ['', required],
        zip: '10000',
      },
      skills: formArray(['TypeScript', 'Rust']),
    });

    expect(userProfile.valid()).toBe(false);
    expect(userProfile.address.city.valid()).toBe(false);

    userProfile.name.set('Alice');
    userProfile.address.city.set('Tokyo');

    expect(userProfile.valid()).toBe(true);
    expect(userProfile.value()).toEqual({
      name: 'Alice',
      address: {
        city: 'Tokyo',
        zip: '10000',
      },
      skills: ['TypeScript', 'Rust'],
    });
  });

  test('bindForm() wires HTMLFormElement inputs and intercepts submit', () => {
    const formEl = doc.createElement('form') as HTMLFormElement;
    formEl.innerHTML = `
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button type="submit">Submit</button>
    `;
    doc.body.appendChild(formEl);

    const loginForm = form({
      email: ['', [required, email]],
      password: ['', required],
    });

    let submittedData: any = null;
    const unbind = bindForm(formEl, loginForm, data => {
      submittedData = data;
    });

    // Submitting invalid form marks all as touched and does NOT call callback
    formEl.dispatchEvent(new (window as any).Event('submit', { cancelable: true }));
    expect(loginForm.touched()).toBe(true);
    expect(loginForm.email.touched()).toBe(true);
    expect(submittedData).toBeNull();

    // Type into inputs
    const emailInput = formEl.querySelector<HTMLInputElement>('input[name="email"]')!;
    const passwordInput = formEl.querySelector<HTMLInputElement>('input[name="password"]')!;

    emailInput.value = 'hello@world.com';
    emailInput.dispatchEvent(new (window as any).Event('input'));

    passwordInput.value = 'password99';
    passwordInput.dispatchEvent(new (window as any).Event('input'));

    expect(loginForm.valid()).toBe(true);

    // Submit valid form
    formEl.dispatchEvent(new (window as any).Event('submit', { cancelable: true }));
    expect(submittedData).toEqual({
      email: 'hello@world.com',
      password: 'password99',
    });

    unbind();
  });
});
