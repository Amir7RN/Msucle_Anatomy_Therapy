/**
 * healthParser.worker.ts
 *
 * Web Worker that unzips an Apple Health export and streams export.xml
 * through the incremental WorkoutXmlScanner — off the main thread, so a
 * 50 MB+ XML never janks the UI. All data stays in the browser.
 *
 * Spawned by parseHealthZip.ts via `new Worker(new URL(...), { type: 'module' })`.
 */

import JSZip from 'jszip'
import {
  WorkoutXmlScanner,
  type ParserWorkerRequest,
  type ParserWorkerResponse,
} from './appleHealthParser'

// jszip's bundled index.d.ts omits internalStream() even though it is a
// documented public API of the browser build — type just what we use.
interface ZipStringStream {
  on(event: 'data', cb: (chunk: string, meta: { percent: number }) => void): ZipStringStream
  on(event: 'end', cb: () => void): ZipStringStream
  on(event: 'error', cb: (err: Error) => void): ZipStringStream
  resume(): ZipStringStream
}
interface StreamableZipEntry {
  internalStream(type: 'string'): ZipStringStream
}

const post = (msg: ParserWorkerResponse): void =>
  (self as unknown as { postMessage(m: ParserWorkerResponse): void }).postMessage(msg)

/**
 * Cap on DECOMPRESSED XML text. A genuine export.xml tops out at a few GB;
 * a zip bomb decompresses to orders of magnitude more. Without a cap the
 * stream would happily spin the worker for hours. When exceeded we post an
 * error — the main thread terminates this worker on any error message, which
 * kills the stream.
 */
const MAX_XML_CHARS = 8 * 1024 * 1024 * 1024 // ~8 G chars

self.onmessage = async (e: MessageEvent) => {
  const { buffer } = e.data as ParserWorkerRequest
  const t0 = performance.now()
  try {
    const zip = await JSZip.loadAsync(buffer)

    // export.xml usually lives under apple_health_export/, occasionally at the
    // root. Take the shallowest match; explicitly ignore export_cda.xml.
    const candidates = Object.keys(zip.files)
      .filter((name) => /(^|\/)export\.xml$/i.test(name) && !zip.files[name].dir)
      .sort((a, b) => a.length - b.length)
    const entryName = candidates[0]
    if (!entryName) {
      post({ kind: 'error', message: 'No export.xml found in this zip. Use the Health app on your iPhone: profile picture, then "Export All Health Data".' })
      return
    }

    const scanner = new WorkoutXmlScanner()
    const entry = zip.files[entryName] as unknown as StreamableZipEntry

    let lastReported = -1
    let streamedChars = 0
    let aborted = false
    await new Promise<void>((resolve, reject) => {
      entry
        .internalStream('string')
        .on('data', (chunk, meta) => {
          if (aborted) return
          streamedChars += chunk.length
          if (streamedChars > MAX_XML_CHARS) {
            aborted = true
            reject(new Error('This export decompresses far beyond any real Apple Health file, so the import was stopped. Re-export from the Health app and try again.'))
            return
          }
          scanner.push(chunk)
          const pct = Math.floor(meta.percent)
          if (pct !== lastReported) {
            lastReported = pct
            post({ kind: 'progress', percent: pct, workoutsFound: scanner.workouts.length })
          }
        })
        .on('error', reject)
        .on('end', () => resolve())
        .resume()
    })
    scanner.finish()

    // Oldest first — the rolling-average math in Step 4 wants chronological order.
    scanner.workouts.sort((a, b) => a.startDate.localeCompare(b.startDate))

    post({
      kind: 'done',
      result: {
        workouts: scanner.workouts,
        metrics: scanner.metrics(),
        profile: scanner.profile,
        skipped: scanner.skipped,
        parseMs: Math.round(performance.now() - t0),
      },
    })
  } catch (err) {
    post({ kind: 'error', message: err instanceof Error ? err.message : 'Could not read this file.' })
  }
}
