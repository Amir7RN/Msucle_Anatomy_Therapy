/**
 * speechText.ts
 *
 * Guard for LLM-generated text that gets READ ALOUD (or shown as a coaching
 * cue). The coach calls run with small max_tokens budgets, so a chatty reply
 * can be cut off mid-sentence — and a truncated cue is far worse spoken than
 * written ("keep your elbow close to the" …silence).
 *
 * `completeSentences` trims a reply back to its last full sentence boundary,
 * so whatever we speak always ends cleanly. If the text contains no sentence
 * terminator at all (a short fragment like "3 down, 7 to go"), it is returned
 * unchanged — fragments are fine, dangling half-sentences are not.
 */

/** Characters that legitimately end a spoken sentence. */
const TERMINATORS = /[.!?…]/

/** Trailing wrappers that may follow a terminator (quotes, brackets). */
const CLOSERS = new Set(['"', "'", '’', '”', ')', ']'])

/**
 * Trim `text` to its last complete sentence.
 *
 *   completeSentences('Nice depth. Keep your chest')  → 'Nice depth.'
 *   completeSentences('Drive through the heels!')     → 'Drive through the heels!'
 *   completeSentences('3 down, 7 to go')              → '3 down, 7 to go'
 */
export function completeSentences(text: string): string {
  const t = text.trim()
  if (!t) return t

  // Already ends cleanly (terminator, possibly wrapped in a quote/bracket).
  let end = t.length - 1
  while (end > 0 && CLOSERS.has(t[end])) end -= 1
  if (TERMINATORS.test(t[end])) return t

  // Find the last sentence boundary and cut there.
  for (let i = t.length - 1; i >= 0; i--) {
    if (!TERMINATORS.test(t[i])) continue
    // Don't treat a decimal point or an abbreviation-like "no." mid-number as
    // a boundary: require the terminator to be followed by whitespace/closer.
    const next = t[i + 1]
    if (next !== undefined && !/\s/.test(next) && !CLOSERS.has(next)) continue
    // Include any closing quote/bracket that follows the terminator.
    let j = i + 1
    while (j < t.length && CLOSERS.has(t[j])) j += 1
    return t.slice(0, j)
  }

  // No boundary anywhere — the whole reply is one (possibly cut) fragment.
  // Keep it: dropping the only cue we have is worse than an abrupt ending.
  return t
}
