// Python float(text), not JavaScript Number's permissive empty/hex coercion.
// Unicode decimal digits use Python's decimal-to-ASCII transformation.
export function parseVideoFloat(text: string): number {
  let ascii = '';
  for (const character of text) {
    if (/\p{Decimal_Number}/u.test(character)) {
      const point = character.codePointAt(0)!;
      let start = point;
      while (start > 0 && /\p{Decimal_Number}/u.test(String.fromCodePoint(start - 1))) start--;
      ascii += (point - start) % 10;
    } else ascii += character;
  }
  // Python's numeric parser accepts Unicode White_Space, not JS's BOM whitespace.
  const value = ascii.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
  if (/^[+-]?(?:inf(?:inity)?|nan)$/i.test(value)) {
    if (/nan/i.test(value)) return NaN;
    return value.startsWith('-') ? -Infinity : Infinity;
  }
  if (!/^[+-]?(?:(?:[0-9](?:_?[0-9])*)(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.(?:[0-9](?:_?[0-9])*))(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/.test(value)) throw new Error('Invalid original video float: ' + text);
  return Number(value.replaceAll('_', ''));
}
