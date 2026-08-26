import React, { useState } from 'react'
import { Download, ShieldCheck, Trash2 } from 'lucide-react'

type LegalKind = 'privacy' | 'terms'

const APP_KEY_PREFIXES = ['muscleAtlas.', 'muscleTwin.', 'zeva.', 'mm.health.']
const SECRET_MARKERS = ['apikey', 'api_key', 'auth-token', 'supabase.auth']

function isAppDataKey(key: string) {
  return APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function isSecretKey(key: string) {
  const lower = key.toLowerCase()
  return SECRET_MARKERS.some((marker) => lower.includes(marker))
}

function exportBrowserData() {
  const data: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || !isAppDataKey(key) || isSecretKey(key)) continue
    const value = localStorage.getItem(key)
    try { data[key] = value === null ? null : JSON.parse(value) } catch { data[key] = value }
  }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `zevahealth-browser-data-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function clearBrowserData() {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && isAppDataKey(key) && !key.toLowerCase().includes('supabase.auth')) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
  return keys.length
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  const [message, setMessage] = useState('')
  const home = import.meta.env.BASE_URL

  if (kind === 'terms') {
    return (
      <LegalShell title="Terms of Use">
        <p>Zevahealth provides educational anatomy, movement guidance, and biofeedback. It is not a medical device and does not diagnose, treat, or replace a licensed clinician.</p>
        <h2>Use safely</h2>
        <p>Do not exercise through sharp, worsening, radiating, or neurological symptoms. Stop when symptoms increase. Seek qualified care for injury, severe pain, weakness, numbness, swelling, chest pain, breathing difficulty, or any concern that may be urgent.</p>
        <h2>Camera and estimates</h2>
        <p>Pose angles and muscle or pain-pattern matches are estimates from a single camera and reference data. They can be wrong when joints are hidden, the camera is poorly placed, or the movement cannot be observed directly.</p>
        <h2>Your responsibility</h2>
        <p>You choose whether to perform an exercise and are responsible for using a safe environment, stable supports, and an appropriate range. Do not rely on the app as the sole basis for a health decision.</p>
        <p><a className="text-cyan-700 underline" href={`${home}?legal=privacy`}>Read the Privacy Notice</a></p>
      </LegalShell>
    )
  }

  return (
    <LegalShell title="Privacy Notice">
      <p className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-slate-700"><strong>Short version:</strong> regular pose coaching runs in your browser. Optional AI features can send text or selected low-resolution images to the configured AI provider. Health and profile data may be stored both in this browser and, for signed-in features, in Supabase.</p>
      <h2>Camera processing</h2>
      <p>Live exercise and assessment frames are processed on-device by MediaPipe in your browser. The regular pose-coaching flow does not upload the live video feed. The app cannot verify physical contact, pain quality, or stretch intensity from those landmarks.</p>
      <h2>Information sent to an AI provider</h2>
      <p>When you use AI chat or coaching, the text you submit and relevant app context are sent through the configured server proxy or to Anthropic. If you explicitly run AI-assisted Body Scan refinement, low-resolution still images plus height, weight, age, and sex may be sent to Anthropic. Do not use those optional features if you do not want that information sent.</p>
      <h2>Browser and cloud storage</h2>
      <p>Profiles, pain reports, imported health summaries, calibrations, assessments, programs, and session history can be stored in browser localStorage. The app does not encrypt localStorage itself; anyone with access to the same unlocked browser profile may be able to read it. Signed-in records stored in Supabase use per-user row-level access rules and transport encryption.</p>
      <h2>Retention and deletion</h2>
      <p>Browser data remains until you clear it below, clear site data, or remove the browser profile. Cloud records remain until removed by the feature that created them or through a verified full-account deletion request. Deleting browser data does not delete your account or cloud records.</p>
      <h2>Model training and access</h2>
      <p>Zevahealth does not use your local health data to train its own models. AI-provider handling is governed by the provider and deployment configured for the app. Practitioner-shared information is available only to the practitioner identity you explicitly authorize; access can be revoked. Product administrators may access infrastructure only for security, support, and legal obligations.</p>
      <h2>Your browser data</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={() => { exportBrowserData(); setMessage('A JSON export was downloaded. API keys and authentication tokens were excluded.') }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-600"><Download size={16} /> Export browser data</button>
        <button onClick={() => { if (window.confirm('Delete Zevahealth data stored in this browser? This cannot be undone.')) { const count = clearBrowserData(); setMessage(`${count} browser data item${count === 1 ? '' : 's'} deleted. Your signed-in account and cloud data were not deleted.`) } }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={16} /> Delete browser data</button>
      </div>
      {message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
      <p>For a cloud-data export or full account deletion, email <a className="text-cyan-700 underline" href="mailto:amir73rn@gmail.com?subject=Zevahealth%20data%20request">amir73rn@gmail.com</a>. Identity verification is required so another person cannot request deletion of your account.</p>
      <p><a className="text-cyan-700 underline" href={`${home}?legal=terms`}>Read the Terms of Use</a></p>
    </LegalShell>
  )
}

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-700">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <a href={import.meta.env.BASE_URL} className="text-sm font-semibold text-cyan-700 hover:underline">← Back to Zevahealth</a>
        <div className="mt-5 flex items-center gap-2"><ShieldCheck className="text-emerald-600" /><h1 className="text-3xl font-bold text-slate-900">{title}</h1></div>
        <p className="mt-2 text-xs text-slate-500">Last updated August 26, 2026</p>
        <div className="mt-8 space-y-5 leading-7 [&_h2]:pt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900">{children}</div>
      </article>
    </main>
  )
}
