import { Transform } from 'class-transformer';

export function StringToArray(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? [value] : value,
  );
}
