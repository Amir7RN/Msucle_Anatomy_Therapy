/**
 * returnToLanding.ts
 *
 * When a feature is opened by deep-link from the landing-page cards
 * (?atlas=1&feature=<key>), closing that feature should send the user back to
 * the public landing page — not leave them staring at the bare atlas model.
 *
 * The `feature` query param is the reliable "came from a landing card" signal:
 * it's only ever present on those deep links. Modal onClose handlers call this
 * first; if it navigates, they skip their normal in-app close.
 */
export function returnToLandingIfDeepLinked(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.has('feature')) {
    window.location.assign(import.meta.env.BASE_URL)
    return true
  }
  return false
}
