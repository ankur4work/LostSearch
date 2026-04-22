/**
 * Normalize a shopper search query so that visually/lexically identical queries
 * collide to the same key.
 *
 * Steps:
 *   1. String-coerce + reject nullish.
 *   2. Unicode NFC to fold compatibility variants of the same character.
 *   3. Lowercase (Turkish-safe via locale 'en-US').
 *   4. Strip zero-width / control chars.
 *   5. Collapse whitespace (including unicode whitespace) to single space.
 *   6. Strip punctuation EXCEPT hyphen `-` and apostrophe `'`
 *      (preserve: "t-shirt", "men's").
 *   7. Trim.
 *
 * The output never throws; for empty/non-string input it returns "".
 */
export function normalizeQuery(input: unknown): string {
  if (typeof input !== 'string') return '';
  let s = input.normalize('NFC');
  s = s.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, '');
  s = s.toLocaleLowerCase('en-US');
  s = s.replace(/[\p{P}\p{S}]/gu, (ch) => (ch === '-' || ch === "'" ? ch : ' '));
  s = s.replace(/\s+/gu, ' ');
  return s.trim();
}

/**
 * Date bucket (UTC, day-truncated) used as the dedup axis for search_queries
 * upsert. Store-local bucketing is handled later in the analytics layer.
 */
export function dateBucketUTC(d: Date): Date {
  const bucket = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  return bucket;
}
