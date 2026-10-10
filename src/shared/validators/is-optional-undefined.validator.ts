import { ValidateIf, type ValidationOptions } from 'class-validator';

export function IsOptionalUndefined(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateIf(
    (_object: unknown, value: unknown): boolean => value !== undefined,
    validationOptions,
  );
}
