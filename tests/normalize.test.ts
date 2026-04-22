import { describe, it, expect } from 'vitest';
import { normalizeQuery, dateBucketUTC } from '@/lib/ingestion/normalize';

describe('normalizeQuery', () => {
  it.each([
    ['plain lowercase', 'tshirt', 'tshirt'],
    ['uppercase → lowercase', 'TShirt', 'tshirt'],
    ['trim edges', '   tshirt   ', 'tshirt'],
    ['collapse internal whitespace', 'red   cotton   tshirt', 'red cotton tshirt'],
    ['tab + newline → space', 'red\tcotton\ntshirt', 'red cotton tshirt'],
    ['preserve hyphen', 't-shirt', 't-shirt'],
    ['preserve apostrophe', "men's shirt", "men's shirt"],
    ['strip common punctuation', 'tshirt!!!', 'tshirt'],
    ['strip commas, periods', 'red, cotton. tshirt', 'red cotton tshirt'],
    ['strip question mark', 'where is my order?', 'where is my order'],
    ['strip slashes', 'mens/womens/kids', 'mens womens kids'],
    ['strip brackets', '(sale) tshirt [new]', 'sale tshirt new'],
    ['strip currency symbols', '$50 tshirt €uro', '50 tshirt uro'],
    ['strip emoji', 'tshirt 🔥🔥', 'tshirt'],
    ['emoji only → empty', '🔥🔥🔥', ''],
    ['NFC: é precomposed vs decomposed match', 'caf\u00E9', 'café'],
    ['NFC decomposed matches precomposed', 'cafe\u0301', 'café'],
    ['strip zero-width space', 'tsh\u200birt', 'tshirt'],
    ['strip zero-width joiner', 'tsh\u200Dirt', 'tshirt'],
    ['strip BOM', '\uFEFFtshirt', 'tshirt'],
    ['strip LRM/RLM markers', '\u200Ftshirt\u200E', 'tshirt'],
    ['strip control chars', '\u0000\u0001tshirt', 'tshirt'],
    ['RTL Arabic stays', 'قميص', 'قميص'],
    ['Hindi Devanagari stays', 'कपड़ा', 'कपड़ा'],
    ['CJK stays', '衬衫', '衬衫'],
    ['mixed scripts collapse spaces', 'shirt   قميص', 'shirt قميص'],
    ['turkish capital I lowercases safely', 'KITAP', 'kitap'],
    ['en-dash stripped', 'tshirt – new', 'tshirt new'],
    ['em-dash stripped', 'tshirt — new', 'tshirt new'],
    ['typographic quotes stripped', '“tshirt”', 'tshirt'],
    ['math symbols stripped', 'a+b=c', 'a b c'],
    ['empty string → empty', '', ''],
    ['whitespace only → empty', '   \t\n', ''],
    ['numbers preserved', 'tshirt 42', 'tshirt 42'],
    ['apostrophe in unicode', 'men\u2019s shirt', 'men s shirt'],
  ])('%s', (_label, input, expected) => {
    expect(normalizeQuery(input)).toBe(expected);
  });

  it('returns "" for non-string inputs', () => {
    expect(normalizeQuery(null)).toBe('');
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery(42)).toBe('');
    expect(normalizeQuery({ q: 'shirt' })).toBe('');
    expect(normalizeQuery([])).toBe('');
  });

  it('is idempotent', () => {
    const inputs = ['  HELLO  world!! ', 'café', 't-shirt', "men's", '👕 tshirt'];
    for (const s of inputs) {
      const once = normalizeQuery(s);
      expect(normalizeQuery(once)).toBe(once);
    }
  });
});

describe('dateBucketUTC', () => {
  it('truncates to UTC day', () => {
    const d = new Date('2026-04-22T23:59:59.999Z');
    const b = dateBucketUTC(d);
    expect(b.toISOString()).toBe('2026-04-22T00:00:00.000Z');
  });
  it('ignores local timezone offset', () => {
    const d = new Date('2026-04-22T01:30:00+09:00');
    const b = dateBucketUTC(d);
    expect(b.toISOString()).toBe('2026-04-21T00:00:00.000Z');
  });
});
