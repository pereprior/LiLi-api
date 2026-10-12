export class StringUtils {
  static removeWhitespace(value: string): string {
    return value.replace(/\s/gu, '');
  }
}
