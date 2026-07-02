/**
 * parseHealthZip.ts
 *
 * Main-thread entry point: hand it the user's Apple Health export (.zip File)
 * and it spawns healthParser.worker.ts, relays progress, and resolves with the
 * parsed workout list. Client-side only — nothing leaves the browser.
 */

import type { HealthParseResult, ParserWorkerResponse } from './appleHealthParser'

export interface ParseProgress {
  /** 0-100, based on how much of export.xml has been decompressed. */
  percent: number
  workoutsFound: number
}

export function parseHealthZip(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<HealthParseResult> {
  return new Promise<HealthParseResult>((resolve, reject) => {
    const worker = new Worker(new URL('./healthParser.worker.ts', import.meta.url), {
      type: 'module',
    })
    const done = (fn: () => void) => {
      worker.terminate()
      fn()
    }
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as ParserWorkerResponse
      if (msg.kind === 'progress') {
        onProgress?.({ percent: msg.percent, workoutsFound: msg.workoutsFound })
      } else if (msg.kind === 'done') {
        done(() => resolve(msg.result))
      } else {
        done(() => reject(new Error(msg.message)))
      }
    }
    worker.onerror = (e) => {
      done(() => reject(new Error(e.message || 'Import failed while reading the file.')))
    }
    file
      .arrayBuffer()
      .then((buf) => worker.postMessage({ buffer: buf }, [buf]))
      .catch((err) => done(() => reject(err instanceof Error ? err : new Error(String(err)))))
  })
}
