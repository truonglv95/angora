export type ValidationErrors = Record<string, any>;
export type ValidatorFn = (value: any) => ValidationErrors | null;
export type AsyncValidatorFn = (value: any) => Promise<ValidationErrors | null>;

export class Validators {
  static required: ValidatorFn = (value: any) => {
    if (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return { required: true };
    }
    return null;
  };

  static minLength(length: number): ValidatorFn {
    return (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const str = String(value);
      return str.length < length
        ? { minlength: { requiredLength: length, actualLength: str.length } }
        : null;
    };
  }

  static maxLength(length: number): ValidatorFn {
    return (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const str = String(value);
      return str.length > length
        ? { maxlength: { requiredLength: length, actualLength: str.length } }
        : null;
    };
  }

  static email: ValidatorFn = (value: any) => {
    if (value === null || value === undefined || value === '') return null;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(String(value)) ? null : { email: true };
  };

  static pattern(pattern: string | RegExp): ValidatorFn {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      return regex.test(String(value))
        ? null
        : { pattern: { requiredPattern: pattern.toString(), actualValue: value } };
    };
  }

  static min(minVal: number): ValidatorFn {
    return (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      return !isNaN(num) && num < minVal ? { min: { min: minVal, actual: num } } : null;
    };
  }

  static max(maxVal: number): ValidatorFn {
    return (value: any) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      return !isNaN(num) && num > maxVal ? { max: { max: maxVal, actual: num } } : null;
    };
  }
}
