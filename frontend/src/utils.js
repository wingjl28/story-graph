/**
 * Match a string against a pattern that may contain * wildcards.
 * Without wildcards, does a case-insensitive substring match.
 * With wildcards, converts * → .* and does a full regex match.
 */
export function wildcardMatch(pattern, str) {
  if (!pattern) return true
  if (!pattern.includes('*')) return str.toLowerCase().includes(pattern.toLowerCase())
  const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  return new RegExp(regexStr, 'i').test(str)
}
