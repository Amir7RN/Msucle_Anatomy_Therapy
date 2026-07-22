/**
 * HeroStage.tsx
 *
 * The landing-page hero as a free-form, PowerPoint-style canvas: a video frame,
 * the "Muscle pain relief…" copy panel, and five dynamic data boxes, each of
 * which can be DRAGGED and RESIZED live in the browser.
 *
 * ── How to arrange it yourself ───────────────────────────────────────────────
 *   1. Open the landing page with ?edit=1  (e.g. http://localhost:5173/?edit=1)
 *   2. Drag any element to move it; drag its bottom-right corner to resize it.
 *      (The video keeps a 16:9 shape; text/boxes just change width.)
 *   3. When it looks right, click "Copy layout" in the toolbar and send me the
 *      JSON. I'll bake it into DEFAULT_LAYOUT and remove the editor.
 *
 * Positions are stored in a fixed 1280×640 "design" space and the whole stage is
 * scaled to fit the column, so the numbers you export mean the same thing on any
 * screen. Your arrangement is also saved to localStorage, so it persists (and
 * shows even with edit mode off) until you reset it.
 *
 * Below the `lg` breakpoint the canvas can't be dragged sensibly, so we fall back
 * to a simple readable stacked layout.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Sparkles, Copy, RotateCcw, Check } from 'lucide-react'

// Hero video is the cinematic "golf → shoulder → open Zeva" story clip. The
// old MainVideoLanding demo + its data callout boxes moved into the platform
// section (see ZevahealthHome MovementShowcase).
const mainVideoUrl = new URL('../../../FireFlyZevaHealthAI.mp4', import.meta.url).href

// Design coordinate space. All layout numbers below are in these units. The
// canvas is scaled to fit the column width, so the whole arrangement stays intact
// (nothing clipped) on any screen size. Sized to fit the finalized layout below.
const DESIGN_W = 1800
const DESIGN_H = 700
const LS_KEY = 'mm.hero.layout.v4'

export type Box = { x: number; y: number; w: number }
export type HeroLayout = {
  // Copy is now four independent groups you can place separately.
  badge: Box
  headline: Box
  copy: Box
  cta: Box
  video: Box
  twin: Box
  engagement: Box
  balance: Box
  rom: Box
}

// Finalized arrangement (from the in-page editor).
const DEFAULT_LAYOUT: HeroLayout = {
  badge:      { x: 29,   y: 185, w: 380 },
  headline:   { x: 351,  y: -7,  w: 1397 },
  copy:       { x: 75,   y: 274, w: 258 },
  cta:        { x: 57,   y: 537, w: 300 },
  video:      { x: 471,  y: 112, w: 1022 },
  twin:       { x: 471,  y: 112, w: 190 },
  engagement: { x: 1502, y: 129, w: 204 },
  balance:    { x: 1502, y: 352, w: 216 },
  rom:        { x: 1502, y: 571, w: 216 },
}

const ITEM_IDS: (keyof HeroLayout)[] = ['badge', 'headline', 'copy', 'cta', 'video', 'twin', 'engagement', 'balance', 'rom']
// The data callout boxes now live in the platform section, so the hero renders
// only the copy groups + the video. (Layout/types for the boxes are kept so any
// saved editor JSON stays valid.)
const HERO_RENDER_IDS: (keyof HeroLayout)[] = ['badge', 'headline', 'copy', 'cta', 'video']
const ITEM_LABEL: Record<keyof HeroLayout, string> = {
  badge: 'Badge', headline: 'Headline', copy: 'Paragraph', cta: 'Buttons',
  video: 'Video frame', twin: 'Digital Twin',
  engagement: 'Muscle Engagement', balance: 'Left / Right', rom: 'Range of Motion',
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }

// ─────────────────────────── Small live sub-plots ───────────────────────────

function LiveSparkline({ data, gradId }: { data: number[]; gradId: string }) {
  const W = 128, H = 38
  const line = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-11 w-full overflow-visible">
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

function CalloutCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.75)] backdrop-blur">
      <div className="text-[15px] font-bold leading-tight text-white sm:text-base">{title}</div>
      <div className="mt-0.5 text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">{sub}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

// ─────────────────────────── Content pieces ───────────────────────────

// The copy split into four independently-placeable groups.
function BadgeGroup() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur">
      <Sparkles className="h-4 w-4 text-cyan-500" />
      AI muscle pain diagnosis · posture &amp; movement check · free in your browser
    </span>
  )
}

function HeadlineGroup() {
  // Phone (< sm) gets a smaller size so it never overflows; sm+ (tablet) and
  // the lg+ desktop canvas keep the original 3.4rem exactly as before.
  return (
    <h1 className="text-[2.15rem] leading-[1.05] sm:text-[3.4rem] sm:leading-[0.95] font-extrabold tracking-[-0.045em] text-slate-900">
      <span className="zh-gradient-text bg-gradient-to-r from-orange-500 via-rose-500 to-cyan-500 bg-clip-text text-transparent">
        Muscle pain relief
      </span>{' '}
      starts with knowing the <span className="zh-underline">muscle</span>.
    </h1>
  )
}

function CopyGroup() {
  return (
    <p className="text-lg leading-8 text-slate-600">
      Pinpoint what hurts on a 3D muscle anatomy model, get muscle pain relief exercises matched
      to it, and work out with an AI coach that checks your form and posture on every rep.
    </p>
  )
}

function CtaGroup({ diagnosticUrl }: { diagnosticUrl: string }) {
  return (
    <a href={diagnosticUrl} className="zh-cta-breathe group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-8 py-4 text-base font-semibold text-white transition hover:-translate-y-0.5">
      Find my sore muscle <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </a>
  )
}

function VideoFrame() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-900/10 bg-[radial-gradient(circle_at_50%_35%,#111b34,#070b16)] shadow-[0_40px_90px_-45px_rgba(15,23,42,0.6)]">
      <video src={mainVideoUrl} className="pointer-events-none h-full w-full object-cover" autoPlay muted loop playsInline />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="zh-scan absolute left-[4%] right-[4%] h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent shadow-[0_0_14px_2px_rgba(34,211,238,0.45)]" />
      </div>
    </div>
  )
}

// Renders the inner content of a given item id (boxes use the live values).
function itemContent(id: keyof HeroLayout, live: { spark: number[]; bal: number; rom: number }, urls: { diagnosticUrl: string; atlasUrl: string }) {
  switch (id) {
    case 'badge':
      return <BadgeGroup />
    case 'headline':
      return <HeadlineGroup />
    case 'copy':
      return <CopyGroup />
    case 'cta':
      return <CtaGroup diagnosticUrl={urls.diagnosticUrl} />
    case 'video':
      return <VideoFrame />
    case 'twin':
      return (
        <CalloutCard title="Digital Twin" sub="Live motion & muscle tracking">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
        </CalloutCard>
      )
    case 'engagement':
      return (
        <CalloutCard title="Muscle Engagement" sub="What's firing, in real time">
          <LiveSparkline data={live.spark} gradId="hs-cb2" />
        </CalloutCard>
      )
    case 'balance':
      return (
        <CalloutCard title="Left / Right Balance" sub="Load symmetry across muscles">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div className="h-full bg-cyan-400 transition-all duration-700" style={{ width: `${live.bal}%` }} />
            <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${100 - live.bal}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-semibold tabular-nums">
            <span className="text-cyan-300">L {live.bal}%</span>
            <span className="text-amber-300">R {100 - live.bal}%</span>
          </div>
        </CalloutCard>
      )
    case 'rom':
      return (
        <CalloutCard title="Range of Motion" sub="Every joint, as you move">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-all duration-700" style={{ width: `${live.rom}%` }} />
          </div>
          <div className="mt-1.5 text-right text-[11px] font-semibold tabular-nums text-emerald-300">{live.rom}% of range</div>
        </CalloutCard>
      )
  }
}

// ─────────────────────────── The stage ───────────────────────────

export function HeroStage({ atlasUrl, diagnosticUrl }: { atlasUrl: string; diagnosticUrl: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).has('edit'))
  const [copied, setCopied] = useState(false)

  const [layout, setLayout] = useState<HeroLayout>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<HeroLayout>) }
    } catch {}
    return DEFAULT_LAYOUT
  })

  // Live values so the box plots feel alive.
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

  // Fit the design canvas to the available width.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setScale(clamp(el.clientWidth / DESIGN_W, 0.35, 1.2))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Persist arrangement.
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(layout)) } catch {}
  }, [layout])

  // Drag / resize session (kept in a ref so window listeners see fresh values).
  const drag = useRef<{ id: keyof HeroLayout; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null)
  const scaleRef = useRef(scale); scaleRef.current = scale

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const s = scaleRef.current || 1
      const dx = (e.clientX - d.sx) / s
      const dy = (e.clientY - d.sy) / s
      setLayout((prev) => {
        const it = { ...prev[d.id] }
        if (d.mode === 'move') {
          // No positioning limit — place elements anywhere, including past the
          // canvas edges / on top of the video.
          it.x = Math.round(d.ox + dx)
          it.y = Math.round(d.oy + dy)
        } else {
          it.w = Math.max(90, Math.round(d.ow + dx))
        }
        return { ...prev, [d.id]: it }
      })
    }
    const onUp = () => { drag.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  const begin = (id: keyof HeroLayout, mode: 'move' | 'resize', e: React.PointerEvent) => {
    if (!editing) return
    e.preventDefault(); e.stopPropagation()
    const it = layout[id]
    drag.current = { id, mode, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, ow: it.w }
  }

  const copyLayout = async () => {
    const json = JSON.stringify(layout, null, 2)
    try { await navigator.clipboard.writeText(json) } catch {}
    setCopied(true); window.setTimeout(() => setCopied(false), 1600)
  }
  const resetLayout = () => setLayout(DEFAULT_LAYOUT)

  const live = { spark, bal, rom }
  const urls = { diagnosticUrl, atlasUrl }

  return (
    <>
      {/* ── Mobile / small: readable stack (no free-form canvas) ──────────────
          Changes here are scoped to phones (< sm). Tablet (sm–lg) and the lg+
          desktop canvas are left exactly as they were. */}
      <div className="px-4 lg:hidden">
        <div className="space-y-5">
          <BadgeGroup />
          <HeadlineGroup />
          <CopyGroup />
          <CtaGroup diagnosticUrl={diagnosticUrl} />
        </div>
        <div className="mt-8">
          <VideoFrame />
        </div>
      </div>

      {/* ── Desktop: draggable / resizable design canvas ────────────────────── */}
      <div ref={wrapRef} className="relative hidden lg:block" style={{ height: DESIGN_H * scale }}>
        <div
          className="absolute left-0 top-0"
          style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {HERO_RENDER_IDS.map((id) => {
            const it = layout[id]
            return (
              <div
                key={id}
                onPointerDown={(e) => begin(id, 'move', e)}
                className="absolute"
                style={{
                  left: it.x, top: it.y, width: it.w,
                  cursor: editing ? 'move' : 'default',
                  outline: editing ? '1.5px dashed rgba(56,189,248,0.8)' : 'none',
                  outlineOffset: 4,
                  borderRadius: 16,
                }}
              >
                {/* Content — non-interactive while editing so drags don't click links */}
                <div style={{ pointerEvents: editing ? 'none' : 'auto' }}>
                  {itemContent(id, live, urls)}
                </div>

                {editing && (
                  <>
                    {/* Label */}
                    <div className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-sky-500 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
                      {ITEM_LABEL[id]} · {it.x},{it.y} · w{it.w}
                    </div>
                    {/* Resize handle (bottom-right) */}
                    <div
                      onPointerDown={(e) => begin(id, 'resize', e)}
                      className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-sky-500 shadow"
                      title="Drag to resize width"
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Editor toolbar (desktop, edit mode only) ────────────────────────── */}
      {editing && (
        <div className="fixed bottom-5 right-5 z-[120] hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-2xl backdrop-blur lg:flex">
          <span className="mr-1 font-semibold text-slate-700">Hero editor</span>
          <button onClick={copyLayout} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-white transition hover:bg-sky-600">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy layout'}
          </button>
          <button onClick={resetLayout} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50">
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50">
            Preview
          </button>
        </div>
      )}
      {!editing && new URLSearchParams(window.location.search).has('edit') && (
        <button
          onClick={() => setEditing(true)}
          className="fixed bottom-5 right-5 z-[120] hidden rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-600 shadow-2xl backdrop-blur transition hover:bg-slate-50 lg:block"
        >
          Edit hero
        </button>
      )}
    </>
  )
}
