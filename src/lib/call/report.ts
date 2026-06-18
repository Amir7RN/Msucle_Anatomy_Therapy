/**
 * report.ts
 *
 * One-page biomechanics report for a remote assessment session — static
 * posture captures + the dynamic walk summary + the ankle-angle chart, exported
 * as a PDF (jsPDF) or a PNG.  Browser-native, no server.
 */

import { jsPDF } from 'jspdf'
import { renderGaitPlot, type GaitSample, type GaitSummary } from '../movement/gait'

export interface StaticCapture {
  ts:         number
  leftAnkle:  number | null
  rightAnkle: number | null
  leftShank:  number | null
  rightShank: number | null
}

export interface ReportData {
  date:     Date
  subject?: string
  statics:  StaticCapture[]
  summary:  GaitSummary | null
  samples:  GaitSample[]
}

const fmt = (v: number | null | undefined, suffix = '°') =>
  v == null ? '—' : `${Math.round(v)}${suffix}`

/** Render the ankle-angle chart to an offscreen canvas → PNG data URL. */
export function chartDataUrl(samples: GaitSample[], summary: GaitSummary): string {
  const canvas = document.createElement('canvas')
  renderGaitPlot(canvas, samples, summary)
  return canvas.toDataURL('image/png')
}

export function downloadDataUrl(filename: string, dataUrl: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function buildAssessmentPdf(data: ReportData): void {
  const { date, subject, statics, summary, samples } = data
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const M = 50
  let y = M

  const line = (text: string, size = 10, bold = false, color = '#0f172a') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(color)
    doc.text(text, M, y)
    y += size + 6
  }

  // Header
  line('Ankle Dynamics — Remote Assessment Report', 16, true)
  line(`${subject ? subject + '  ·  ' : ''}${date.toLocaleString()}`, 10, false, '#64748b')
  y += 6
  doc.setDrawColor('#cbd5e1'); doc.line(M, y, pageW - M, y); y += 18

  // Static posture captures
  line('Static posture captures', 12, true)
  if (statics.length === 0) {
    line('No static captures recorded.', 10, false, '#64748b')
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor('#475569')
    doc.text('Time', M, y)
    doc.text('L ankle', M + 150, y); doc.text('R ankle', M + 230, y)
    doc.text('L shank', M + 320, y); doc.text('R shank', M + 400, y)
    y += 14
    doc.setFont('helvetica', 'normal'); doc.setTextColor('#0f172a')
    for (const s of statics) {
      doc.text(new Date(s.ts).toLocaleTimeString(), M, y)
      doc.text(fmt(s.leftAnkle), M + 150, y); doc.text(fmt(s.rightAnkle), M + 230, y)
      doc.text(fmt(s.leftShank), M + 320, y); doc.text(fmt(s.rightShank), M + 400, y)
      y += 13
    }
    line('Ankle = shank↔foot angle in the sagittal (side) view.', 8, false, '#94a3b8')
  }
  y += 10

  // Dynamic walk summary
  line('Dynamic walk summary', 12, true)
  if (!summary) {
    line('No walk recorded.', 10, false, '#64748b')
  } else {
    const rows: Array<[string, string]> = [
      ['Ankle excursion (total ROM)', `L ${fmt(summary.left.excursion)}   R ${fmt(summary.right.excursion)}`],
      ['Peak dorsiflexion (toe up)',  `L ${fmt(summary.left.max)}   R ${fmt(summary.right.max)}`],
      ['Peak plantarflexion (toe down)', `L ${fmt(summary.left.min)}   R ${fmt(summary.right.min)}`],
      ['Mean shank tilt', `L ${fmt(summary.left.meanShank)}   R ${fmt(summary.right.meanShank)}`],
      ['Steps · cadence', `${summary.steps} · ${summary.cadenceSpm}/min`],
      ['Walking speed (est.)', summary.speedMps != null ? `${summary.speedMps} m/s` : '—'],
      ['L/R excursion symmetry', summary.symmetryPct != null ? `${summary.symmetryPct}%` : '—'],
    ]
    doc.setFontSize(10)
    for (const [k, v] of rows) {
      doc.setFont('helvetica', 'normal'); doc.setTextColor('#475569'); doc.text(k, M, y)
      doc.setFont('helvetica', 'bold'); doc.setTextColor('#0f172a'); doc.text(v, M + 250, y)
      y += 15
    }

    // Chart
    if (samples.length > 1) {
      y += 8
      try {
        const url = chartDataUrl(samples, summary)
        const imgW = pageW - M * 2
        const imgH = imgW * (760 / 1100)
        doc.addImage(url, 'PNG', M, y, imgW, imgH)
        y += imgH
      } catch { /* image add failed - skip */ }
    }
  }

  y = Math.min(y + 16, doc.internal.pageSize.getHeight() - M)
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor('#94a3b8')
  doc.text(
    'Sagittal-plane estimate from a single camera — screening tool, not a clinical goniometer. Generated on-device.',
    M, doc.internal.pageSize.getHeight() - M,
  )

  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  doc.save(`ankle-assessment-${stamp}.pdf`)
}
