/**
 * Centralized helper for safe JSON-LD serialization in HTML script tags.
 *
 * Prevents stored XSS breakouts (e.g. `</script><script>...`) by escaping
 * characters that have special meaning in HTML script tags:
 * - `<` is escaped as `\u003c`
 * - `>` is escaped as `\u003e`
 * - `&` is escaped as `\u0026`
 * - Line separators U+2028 and U+2029 are escaped for older JS engines
 *
 * Because `\u003c`, `\u003e`, and `\u0026` are standard JSON Unicode escapes,
 * standard JSON parsers (including Google Search, Bing, and Schema.org crawlers)
 * decode them identically to their literal characters, preserving 100% data fidelity.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
