/**
 * PlatformStage.tsx
 *
 * The "See how your body really moves" content: three capture cards on the
 * left, a large movement video in the middle (Digital Twin overlaid), the
 * three live-data boxes on the right, and the two result cards below.
 *
 * Rendered at true 1:1 size (card/box text matches the "Three tools" benefit
 * cards) inside a wide container — NOT the old scale-to-fit canvas, which
 * shrank all the text whenever the video grew.
 */

import { useEffect, useState } from 'react'
import { ArrowRight, Radar, Move3d, Video, CalendarCheck, Scale } from 'lucide-react'
import { ReplayableVideo } from './ReplayableVideo'

const mainVideoUrl = new URL('../../../MainVideoLanding.mp4', import.meta.url).href

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }

// ─────────────────────────── live sub-plots ───────────────────────────

function LiveSparkline({ data, gradId }: { data: number[]; gradId: string }) {
  const W = 128, H = 40
  const line = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-full overflow-visible">
      <defs>
        <linearGradient id={`${gradId}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06b6d4" /><stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={`${gradId}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" /><stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId}-fill)`} />
      <polyline points={line} fill="none" stroke={`url(#${gradId}-line)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShowcaseCallout({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-2xl border border-white/12 bg-slate-900/90 px-5 py-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur">
      <div className="text-lg font-bold leading-tight text-white">{title}</div>
      <div className="mt-1 text-xs font-medium leading-snug text-slate-400">{sub}</div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

// ─────────────────────────── cards ───────────────────────────

type CardDef = { title: string; body: string; icon: React.ReactNode; tile: string; feature: string; featured?: boolean; result?: boolean }

const CAPTURE_CARDS: CardDef[] = [
  { title: 'Live Muscle Twin', feature: 'twin', tile: 'bg-violet-100 text-violet-600', featured: true, icon: <Radar className="h-6 w-6" />, body: 'Real-time motion analysis: watch muscle effort and fatigue build live as you move — a motion analyzer for any workout or activity.' },
  { title: 'Movement Assessment', feature: 'battery', tile: 'bg-cyan-100 text-cyan-600', icon: <Move3d className="h-6 w-6" />, body: "Checks every body segment's mobility and range of motion, measured by camera — no wearables to strap on." },
  { title: 'Remote Assessment', feature: 'remote', tile: 'bg-rose-100 text-rose-500', icon: <Video className="h-6 w-6" />, body: 'The same live motion analysis as your Muscle Twin, run together over a video call.' },
]

const RESULT_CARDS: CardDef[] = [
  { title: 'My AI Program', feature: 'program', tile: 'bg-orange-100 text-orange-500', result: true, icon: <CalendarCheck className="h-6 w-6" />, body: 'A personalized 4-week plan, generated automatically from your movement assessment results.' },
  { title: 'Symmetry Report', feature: 'symmetry', tile: 'bg-teal-100 text-teal-600', result: true, icon: <Scale className="h-6 w-6" />, body: 'Left-vs-right balance, side by side — drawn straight from your assessment.' },
]

// Card sized to match the site's "Three tools" benefit cards (p-7, h-12 tile,
// text-lg title, text-sm body).
function FeatureCard({ def, href }: { def: CardDef; href: string }) {
  return (
    <a
      href={href}
      className={`zh-shine group relative flex h-full flex-col rounded-3xl bg-white p-7 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.3)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_-30px_rgba(15,23,42,0.4)] border ${def.featured ? 'border-violet-200' : 'border-slate-900/5'}`}
    >
      {def.featured && (
        <span className="absolute right-5 top-5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" /> live
        </span>
      )}
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${def.tile} transition group-hover:scale-110`}>
          {def.icon}
        </span>
        {def.result && (
          <span className="rounded-full border border-slate-900/10 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            From your assessment
          </span>
        )}
      </div>
      <h3 className="text-lg font-bold text-slate-900">{def.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">{def.body}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cyan-600 transition group-hover:gap-2">
        Open <ArrowRight className="h-4 w-4" />
      </span>
    </a>
  )
}

// ─────────────────────────── the section body ───────────────────────────

export function PlatformStage({ atlasUrl }: { atlasUrl: string }) {
  const href = (f: string) => `${atlasUrl}&feature=${f}`

  const [spark, setSpark] = useState<number[]>(() => Array.from({ length: 20 }, (_, i) => 45 + Math.round(26 * Math.sin(i / 2.2))))
  const [bal, setBal] = useState(55)
  const [rom, setRom] = useState(72)
  useEffect(() => {
    const id = window.setInterval(() => {
      setSpark((s) => [...s.slice(1), clamp(s[s.length - 1] + Math.round((Math.random() - 0.5) * 36), 12, 94)])
      setBal((b) => clamp(b + Math.round((Math.random() - 0.5) * 6), 44, 64))
      setRom((r) => clamp(r + Math.round((Math.random() - 0.5) * 14), 32, 96))
    }, 1100)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div>
      {/* Capture & analyze label */}
      <div className="mb-6 flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Capture &amp; analyze</span>
        <span className="h-px flex-1 bg-slate-900/5" />
      </div>

      {/* Main row: capture cards · big video · data boxes */}
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:items-start">
        {/* Left — three capture cards */}
        <div className="flex flex-col gap-5">
          {CAPTURE_CARDS.map((c) => (
            <FeatureCard key={c.feature} def={c} href={href(c.feature)} />
          ))}
        </div>

        {/* Center — large video with the Digital Twin overlay */}
        <div className="relative">
          <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-900/10 bg-[radial-gradient(circle_at_50%_35%,#111b34,#070b16)] shadow-[0_40px_90px_-45px_rgba(15,23,42,0.6)]">
            <ReplayableVideo src={mainVideoUrl} className="pointer-events-none h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="zh-scan absolute left-[4%] right-[4%] h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent shadow-[0_0_14px_2px_rgba(34,211,238,0.45)]" />
            </div>
          </div>
          <div className="absolute left-4 top-4 w-52">
            <ShowcaseCallout title="Digital Twin" sub="Live motion & muscle tracking">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
              </span>
            </ShowcaseCallout>
          </div>
        </div>

        {/* Right — three live-data boxes */}
        <div className="flex flex-col gap-5">
          <ShowcaseCallout title="Muscle Engagement" sub="What's firing, in real time">
            <LiveSparkline data={spark} gradId="ps-eng" />
          </ShowcaseCallout>
          <ShowcaseCallout title="Left / Right Balance" sub="Load symmetry across muscles">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-700/60">
              <div className="h-full bg-cyan-400 transition-all duration-700" style={{ width: `${bal}%` }} />
              <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${100 - bal}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs font-semibold tabular-nums">
              <span className="text-cyan-300">L {bal}%</span>
              <span className="text-amber-300">R {100 - bal}%</span>
            </div>
          </ShowcaseCallout>
          <ShowcaseCallout title="Range of Motion" sub="Every joint, as you move">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700/60">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-all duration-700" style={{ width: `${rom}%` }} />
            </div>
            <div className="mt-2 text-right text-xs font-semibold tabular-nums text-emerald-300">{rom}% of range</div>
          </ShowcaseCallout>
        </div>
      </div>

      {/* Connector — the results flow out of the tools above */}
      <div className="my-10 flex items-center justify-center gap-3">
        <span className="h-px w-12 bg-slate-900/10 sm:w-20" />
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          <ArrowRight className="h-4 w-4" /> Your results, automatically
        </span>
        <span className="h-px w-12 bg-slate-900/10 sm:w-20" />
      </div>

      {/* Results — two cards below */}
      <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
        {RESULT_CARDS.map((c) => (
          <FeatureCard key={c.feature} def={c} href={href(c.feature)} />
        ))}
      </div>
    </div>
  )
}
