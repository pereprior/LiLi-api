import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

export function IsRequiredString(
  options: { allowUndefined?: boolean } = {},
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isRequiredString',
      validator: {
        validate: (value: unknown): boolean => {
          if (value === undefined && options.allowUndefined === true)
            return true;
          return typeof value === 'string' && /\S/u.test(value);
        },
        defaultMessage: buildMessage(
          (prefix: string): string =>
            `${prefix}$property must be a string containing non-whitespace characters`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
