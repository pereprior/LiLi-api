import {
  buildMessage,
  isDateString,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

export function IsDateOrDateTime(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDateOrDateTime',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/u.test(value) &&
          isDateString(value, { strict: true }),
        defaultMessage: buildMessage(
          (prefix: string): string =>
            `${prefix}$property must be a valid date in YYYY-MM-DD or YYYY-MM-DDTHH:mm format`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
