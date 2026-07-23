/**
 * PlatformStage.tsx
 *
 * PowerPoint-style drag/resize editor for the "See how your body really moves"
 * section — the movement video, its four live-data boxes, and the five feature
 * cards. Open the page with ?editp=1 to arrange it.
 *
 * KEY DIFFERENCE from the hero editor: everything is positioned at TRUE 1:1
 * pixels (no transform-scale on the canvas), so text never shrinks. Resizing an
 * element widens it directly, so more words fit per line. When it looks right,
 * click "Copy layout" and paste the JSON back — it's baked into DEFAULT_LAYOUT.
 *
 * Below lg it falls back to a readable stacked layout.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, Copy, RotateCcw, Check, Radar, Move3d, Video, CalendarCheck, Scale } from 'lucide-react'
import { ReplayableVideo } from './ReplayableVideo'

const mainVideoUrl = new URL('../../../MainVideoLanding.mp4', import.meta.url).href
const LS_KEY = 'mm.platform.layout.v3'

type Box = { x: number; y: number; w: number }
type ItemId =
  | 'video' | 'boxTwin' | 'boxEngagement' | 'boxBalance' | 'boxRom'
  | 'twinCard' | 'movementCard' | 'remoteCard' | 'programCard' | 'symmetryCard'
type Layout = Record<ItemId, Box>

const ITEM_IDS: ItemId[] = [
  'video', 'boxTwin', 'boxEngagement', 'boxBalance', 'boxRom',
  'twinCard', 'movementCard', 'remoteCard', 'programCard', 'symmetryCard',
]
const ITEM_LABEL: Record<ItemId, string> = {
  video: 'Video', boxTwin: 'Box · Digital Twin', boxEngagement: 'Box · Engagement',
  boxBalance: 'Box · Left/Right', boxRom: 'Box · Range of Motion',
  twinCard: 'Card · Muscle Twin', movementCard: 'Card · Movement', remoteCard: 'Card · Remote',
  programCard: 'Card · AI Program', symmetryCard: 'Card · Symmetry',
}

// Finalized arrangement — TRUE pixels (1:1). Drag/resize to change; send me the JSON.
const DEFAULT_LAYOUT: Layout = {
  twinCard:      { x: 0,    y: 0,   w: 300 },
  movementCard:  { x: 0,    y: 300, w: 300 },
  remoteCard:    { x: 0,    y: 600, w: 300 },
  video:         { x: 340,  y: 0,   w: 760 },
  boxTwin:       { x: 360,  y: 16,  w: 200 },
  boxEngagement: { x: 1130, y: 0,   w: 300 },
  boxBalance:    { x: 1130, y: 150, w: 300 },
  boxRom:        { x: 1130, y: 300, w: 300 },
  programCard:   { x: 340,  y: 470, w: 370 },
  symmetryCard:  { x: 730,  y: 470, w: 370 },
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }

// ─────────────────────────── content pieces ───────────────────────────

function LiveSparkline({ data, gradId }: { data: number[]; gradId: string }) {
  const W = 128, H = 40
  const line = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full overflow-visible">
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
    <div className="w-full rounded-2xl border border-white/12 bg-slate-900/90 px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur">
      <div className="text-[15px] font-bold leading-tight text-white">{title}</div>
      <div className="mt-0.5 text-[11px] font-medium leading-snug text-slate-400">{sub}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

type CardDef = { title: string; body: string; icon: React.ReactNode; tile: string; feature: string; featured?: boolean; result?: boolean }
const CARDS: Record<'twinCard' | 'movementCard' | 'remoteCard' | 'programCard' | 'symmetryCard', CardDef> = {
  twinCard:     { title: 'Live Muscle Twin', feature: 'twin', tile: 'bg-violet-100 text-violet-600', featured: true, icon: <Radar className="h-6 w-6" />, body: 'Real-time motion analysis: watch muscle effort and fatigue build live as you move — a motion analyzer for any workout or activity.' },
  movementCard: { title: 'Movement Assessment', feature: 'battery', tile: 'bg-cyan-100 text-cyan-600', icon: <Move3d className="h-6 w-6" />, body: "Checks every body segment's mobility and range of motion, measured by camera — no wearables to strap on." },
  remoteCard:   { title: 'Remote Assessment', feature: 'remote', tile: 'bg-rose-100 text-rose-500', icon: <Video className="h-6 w-6" />, body: 'The same live motion analysis as your Muscle Twin, run together over a video call.' },
  programCard:  { title: 'My AI Program', feature: 'program', tile: 'bg-orange-100 text-orange-500', result: true, icon: <CalendarCheck className="h-6 w-6" />, body: 'A personalized 4-week plan, generated automatically from your movement assessment results.' },
  symmetryCard: { title: 'Symmetry Report', feature: 'symmetry', tile: 'bg-teal-100 text-teal-600', result: true, icon: <Scale className="h-6 w-6" />, body: 'Left-vs-right balance, side by side — drawn straight from your assessment.' },
}

function FeatureCard({ def, href }: { def: CardDef; href: string }) {
  return (
    <a
      href={href}
      className={`zh-shine group relative flex h-full flex-col rounded-3xl bg-white p-6 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.3)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_-30px_rgba(15,23,42,0.4)] border ${def.featured ? 'border-violet-200' : 'border-slate-900/5'}`}
    >
      {def.featured && (
        <span className="absolute right-5 top-5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" /> live
        </span>
      )}
      <div className="mb-4 flex items-start justify-between gap-3">
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

function VideoFrame() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-900/10 bg-[radial-gradient(circle_at_50%_35%,#111b34,#070b16)] shadow-[0_40px_90px_-45px_rgba(15,23,42,0.6)]">
      <ReplayableVideo src={mainVideoUrl} className="pointer-events-none h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="zh-scan absolute left-[4%] right-[4%] h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent shadow-[0_0_14px_2px_rgba(34,211,238,0.45)]" />
      </div>
    </div>
  )
}

function itemContent(id: ItemId, live: { spark: number[]; bal: number; rom: number }, atlasUrl: string): React.ReactNode {
  const href = (f: string) => `${atlasUrl}&feature=${f}`
  switch (id) {
    case 'video': return <VideoFrame />
    case 'boxTwin':
      return (
        <ShowcaseCallout title="Digital Twin" sub="Live motion & muscle tracking">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400" />
          </span>
        </ShowcaseCallout>
      )
    case 'boxEngagement':
      return (
        <ShowcaseCallout title="Muscle Engagement" sub="What's firing, in real time">
          <LiveSparkline data={live.spark} gradId="ps-eng" />
        </ShowcaseCallout>
      )
    case 'boxBalance':
      return (
        <ShowcaseCallout title="Left / Right Balance" sub="Load symmetry across muscles">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div className="h-full bg-cyan-400 transition-all duration-700" style={{ width: `${live.bal}%` }} />
            <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${100 - live.bal}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-semibold tabular-nums">
            <span className="text-cyan-300">L {live.bal}%</span>
            <span className="text-amber-300">R {100 - live.bal}%</span>
          </div>
        </ShowcaseCallout>
      )
    case 'boxRom':
      return (
        <ShowcaseCallout title="Range of Motion" sub="Every joint, as you move">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-all duration-700" style={{ width: `${live.rom}%` }} />
          </div>
          <div className="mt-1.5 text-right text-[11px] font-semibold tabular-nums text-emerald-300">{live.rom}% of range</div>
        </ShowcaseCallout>
      )
    default:
      return <FeatureCard def={CARDS[id as keyof typeof CARDS]} href={href(CARDS[id as keyof typeof CARDS].feature)} />
  }
}

// ─────────────────────────── the stage ───────────────────────────

export function PlatformStage({ atlasUrl }: { atlasUrl: string }) {
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).has('editp'))
  const [copied, setCopied] = useState(false)
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<Layout>) }
    } catch {}
    return DEFAULT_LAYOUT
  })

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

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(layout)) } catch {}
  }, [layout])

  // Measure real item heights (content-driven) so the canvas reserves the right
  // vertical space and never overlaps the next section.
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [canvasH, setCanvasH] = useState(700)
  useLayoutEffect(() => {
    let maxB = 0
    for (const id of ITEM_IDS) {
      const el = itemRefs.current[id]
      if (el) maxB = Math.max(maxB, layout[id].y + el.offsetHeight)
    }
    if (maxB > 0) setCanvasH(maxB + 24)
  }, [layout, spark, bal, rom])

  // 1:1 drag / resize.
  const drag = useRef<{ id: ItemId; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number } | null>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.sx
      const dy = e.clientY - d.sy
      setLayout((prev) => {
        const it = { ...prev[d.id] }
        if (d.mode === 'move') { it.x = Math.round(d.ox + dx); it.y = Math.round(d.oy + dy) }
        else { it.w = Math.max(120, Math.round(d.ow + dx)) }
        return { ...prev, [d.id]: it }
      })
    }
    const onUp = () => { drag.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  const begin = (id: ItemId, mode: 'move' | 'resize', e: React.PointerEvent) => {
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
  const href = (f: string) => `${atlasUrl}&feature=${f}`
  const canvasW = Math.max(...ITEM_IDS.map((id) => layout[id].x + layout[id].w), 1000)

  return (
    <>
      {/* Mobile / small (< lg): readable stack */}
      <div className="lg:hidden">
        <div className="flex flex-col gap-4">
          {(['twinCard', 'movementCard', 'remoteCard'] as const).map((id) => (
            <FeatureCard key={id} def={CARDS[id]} href={href(CARDS[id].feature)} />
          ))}
          <div className="relative">
            <VideoFrame />
            <div className="absolute left-3 top-3 w-44">{itemContent('boxTwin', live, atlasUrl)}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {itemContent('boxEngagement', live, atlasUrl)}
            {itemContent('boxBalance', live, atlasUrl)}
            {itemContent('boxRom', live, atlasUrl)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['programCard', 'symmetryCard'] as const).map((id) => (
              <FeatureCard key={id} def={CARDS[id]} href={href(CARDS[id].feature)} />
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: true 1:1 draggable / resizable canvas (scrolls horizontally
          only if the arrangement is wider than the section). */}
      <div className="relative hidden overflow-x-auto pb-1 lg:block">
        <div className="relative mx-auto" style={{ width: canvasW, height: canvasH }}>
          {ITEM_IDS.map((id) => {
            const it = layout[id]
            return (
              <div
                key={id}
                ref={(el) => { itemRefs.current[id] = el }}
                onPointerDown={(e) => begin(id, 'move', e)}
                className="absolute"
                style={{
                  left: it.x, top: it.y, width: it.w,
                  cursor: editing ? 'move' : 'default',
                  outline: editing ? '1.5px dashed rgba(56,189,248,0.8)' : 'none',
                  outlineOffset: 4, borderRadius: 16,
                }}
              >
                <div style={{ pointerEvents: editing ? 'none' : 'auto' }}>
                  {itemContent(id, live, atlasUrl)}
                </div>
                {editing && (
                  <>
                    <div className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-sky-500 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
                      {ITEM_LABEL[id]} · {it.x},{it.y} · w{it.w}
                    </div>
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

      {/* Editor toolbar — bottom-left so it never collides with the hero editor. */}
      {editing && (
        <div className="fixed bottom-5 left-5 z-[120] hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-2xl backdrop-blur lg:flex">
          <span className="mr-1 font-semibold text-slate-700">Platform editor</span>
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
      {!editing && new URLSearchParams(window.location.search).has('editp') && (
        <button
          onClick={() => setEditing(true)}
          className="fixed bottom-5 left-5 z-[120] hidden rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-600 shadow-2xl backdrop-blur transition hover:bg-slate-50 lg:block"
        >
          Edit platform section
        </button>
      )}
    </>
  )
}
