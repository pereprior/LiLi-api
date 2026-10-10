import {
  buildMessage,
  isDateString,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

export function IsDateOnly(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDateOnly',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
          isDateString(value, { strict: true }),
        defaultMessage: buildMessage(
          (prefix: string): string =>
            `${prefix}$property must be a valid date in YYYY-MM-DD format`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
