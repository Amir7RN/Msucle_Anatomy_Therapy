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

/**
 * Upper bound on the compressed zip we accept. Real Apple Health exports are
 * typically 50–300 MB; 1 GB leaves generous headroom while stopping an
 * arbitrarily large upload from being buffered wholesale into an ArrayBuffer
 * and exhausting the tab's memory.
 */
const MAX_ZIP_BYTES = 1024 * 1024 * 1024 // 1 GB

export function parseHealthZip(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<HealthParseResult> {
  return new Promise<HealthParseResult>((resolve, reject) => {
    if (file.size > MAX_ZIP_BYTES) {
      reject(new Error(
        `This file is ${(file.size / (1024 * 1024 * 1024)).toFixed(1)} GB — larger than the 1 GB limit. ` +
        'Export a fresh copy from the Health app (it should be well under this size).',
      ))
      return
    }
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
