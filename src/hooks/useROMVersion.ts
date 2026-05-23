/**
 * useROMVersion — React hook that returns a number that increments whenever
 * the ROM history changes (save, clear, sign-in hydrate, sign-out reset).
 * Add the returned value to a useMemo's deps and the memo will re-run after
 * each assessment, so derived UI (severity banner, ranked exercises, the
 * Recommended badge) refreshes without waiting for unrelated re-renders.
 */

import { useEffect, useState } from 'react'
import { getROMVersion, subscribeROM } from '../lib/movement/romHistory'

export function useROMVersion(): number {
  const [v, setV] = useState<number>(() => getROMVersion())
  useEffect(() => {
    const unsub = subscribeROM(() => setV(getROMVersion()))
    return () => { unsub() }
  }, [])
  return v
}
