import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bot,
  Camera,
  ChevronRight,
  Gauge,
  Heart,
  LogIn,
  LogOut,
  MessageSquare,
  Mic,
  MousePointerClick,
  PlayCircle,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useAuth } from './lib/auth/authContext'
import { AuthModal } from './components/auth/AuthModal'

type ZevahealthHomeProps = {
  atlasUrl: string
  diagnosticUrl: string
}

const diagnosisVideoUrl = new URL('../Videos/Shoulder-Deltoid/Diagnosis.mp4', import.meta.url).href
const aiCoachVideoUrl = new URL('../Videos/Shoulder-Deltoid/AICouch.mp4', import.meta.url).href
const chatBotImageBefore = new URL('../Videos/Shoulder-Deltoid/ChatBotImage_Example1.png', import.meta.url).href
const chatBotImageAfter = new URL('../Videos/Shoulder-Deltoid/ChatBotImage_Example2.png', import.meta.url).href

/* ─────────────────────────── Brand mark ───────────────────────────
   Stylized "Z" formed by a top stroke, a curving diagonal, and a
   bottom stroke — with a small orange pulse dot on the curve to
   suggest the "tracked focal point" concept that runs through the
   product (pose tracking, primary zone, etc.). */
function ZevaLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M11 12 H29 C18 16 14 22 11 28 H29"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14.5" cy="22" r="2" fill="#fb923c" />
    </svg>
  )
}

/* Triggers a panel's animation only once it's scrolled into view, and signals
   when it leaves so the panel can pause/reset. */
function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return [ref, inView] as const
}

/* Fade-and-rise reveal that fires once when the element scrolls into view. */
function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`zh-reveal ${shown ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function ZevahealthHome({ atlasUrl, diagnosticUrl }: ZevahealthHomeProps) {
  const { user, signOut } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')

  return (
    <main className="relative h-full min-h-screen overflow-y-auto bg-[#f6f8fc] text-slate-700 antialiased">
      {/* ── Background ambience ─────────────────────────────────────────────── */}
      {/* Fine light grid */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(15,23,42,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.028)_1px,transparent_1px)] bg-[length:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      {/* Soft color blooms */}
      <div className="zh-blob-a pointer-events-none fixed left-[-8rem] top-[-10rem] h-[36rem] w-[36rem] rounded-full bg-cyan-300/40 blur-[140px]" />
      <div className="zh-blob-b pointer-events-none fixed right-[-10rem] top-[6rem] h-[34rem] w-[34rem] rounded-full bg-orange-300/40 blur-[150px]" />
      <div className="zh-blob-a pointer-events-none fixed bottom-[-12rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-rose-200/40 blur-[150px]" />

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 border-b border-slate-900/5 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-[0_8px_24px_-8px_rgba(8,145,178,0.7)]">
              <ZevaLogo className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight text-slate-900">Zevahealth AI</span>
              <span className="block text-xs text-slate-500">Move smarter. Feel better.</span>
            </span>
          </a>

          <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 lg:flex">
            <a href="#pinpoint" className="transition hover:text-slate-900">Pinpoint</a>
            <a href="#chat" className="transition hover:text-slate-900">Just Ask</a>
            <a href="#coach" className="transition hover:text-slate-900">Form Coach</a>
            <a href="#why" className="transition hover:text-slate-900">Why Zeva</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <span
                  className="hidden max-w-[160px] truncate text-xs text-slate-500 sm:inline"
                  title={user.email ?? ''}
                >
                  {user.email}
                </span>
                <button
                  onClick={() => signOut()}
                  title="Sign out"
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setAuthMode('signin'); setAuthOpen(true) }}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign in
                </button>
                <button
                  onClick={() => { setAuthMode('signup'); setAuthOpen(true) }}
                  className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 sm:inline"
                >
                  Sign up
                </button>
              </>
            )}
            <a
              href={diagnosticUrl}
              className="rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(244,63,94,0.7)] transition hover:shadow-[0_14px_36px_-8px_rgba(244,63,94,0.85)]"
            >
              Open App
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section id="top" className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-16 text-center sm:px-8 lg:pt-24">
        <Reveal className="mb-7 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur">
            <Sparkles className="h-4 w-4 text-cyan-500" />
            For every body — desk workers, lifters, runners, weekend warriors
          </span>
        </Reveal>

        <Reveal delay={60}>
          <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] text-slate-900 sm:text-7xl lg:text-[5.5rem]">
            Sore spots shouldn&apos;t be a{' '}
            <span className="zh-gradient-text bg-gradient-to-r from-orange-500 via-rose-500 to-cyan-500 bg-clip-text text-transparent">
              mystery
            </span>
            .
          </h1>
        </Reveal>

        <Reveal delay={120}>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            Talk to the AI or pinpoint the muscle behind the hurt. Then move through suggested exercises with your AI
            coach — and feel better.
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={diagnosticUrl}
              className="group inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-8 py-4 text-base font-semibold text-white shadow-[0_18px_45px_-15px_rgba(244,63,94,0.8)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_55px_-15px_rgba(244,63,94,0.9)]"
            >
              Try it free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href={atlasUrl}
              className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-8 py-4 text-base font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:text-cyan-700"
            >
              Explore the body <ChevronRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-6 text-sm text-slate-500">No signup. No download. Works in your browser.</p>
        </Reveal>

        {/* Hero product showcase — framed app preview with floating chips */}
        <Reveal delay={120} className="relative mx-auto mt-16 max-w-5xl">
          {/* Floating accent chips */}
          <div className="zh-float pointer-events-none absolute -left-4 top-10 z-20 hidden rounded-2xl border border-slate-900/5 bg-white/90 px-4 py-3 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] backdrop-blur md:block">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-500">
                <Heart className="h-4 w-4" />
              </span>
              <div className="text-left">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Likely source</div>
                <div className="text-sm font-bold text-slate-900">Deltoid · 98%</div>
              </div>
            </div>
          </div>

          <div className="zh-float-slow pointer-events-none absolute -right-4 top-24 z-20 hidden rounded-2xl border border-slate-900/5 bg-white/90 px-4 py-3 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] backdrop-blur md:block">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-600">
                <Activity className="h-4 w-4" />
              </span>
              <div className="text-left">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Pose tracking</div>
                <div className="text-sm font-bold text-slate-900">Live · 92° joint</div>
              </div>
            </div>
          </div>

          <BrowserFrame label="zevahealth.ai/diagnose">
            <HeroVideo />
          </BrowserFrame>
        </Reveal>
      </section>

      {/* ── Audience marquee strip ──────────────────────────────────────────── */}
      <section className="relative z-10 mt-4 overflow-hidden border-y border-slate-900/5 bg-white/60 py-5 backdrop-blur">
        <div className="zh-marquee-track gap-3 px-3">
          {[...AUDIENCE, ...AUDIENCE].map((a, i) => (
            <span
              key={i}
              className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-orange-400" />
              {a}
            </span>
          ))}
        </div>
      </section>

      {/* ── Stat band ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 70}>
              <div className="h-full rounded-3xl border border-slate-900/5 bg-white p-6 text-center shadow-[0_24px_60px_-35px_rgba(15,23,42,0.3)]">
                <div className="bg-gradient-to-r from-cyan-600 to-teal-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
                  {s.value}
                </div>
                <div className="mt-1.5 text-sm font-medium text-slate-500">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Feature 1 — Pinpoint the muscle ─────────────────────────────────── */}
      <section id="pinpoint" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
        <Reveal>
          <PanelHeader
            eyebrow="Pinpoint the Muscle"
            icon={<ScanSearch className="h-3.5 w-3.5" />}
            title="Tap the spot. Find the source."
            subtitle="Watch how Zevahealth turns a hand on a sore shoulder into a clear answer."
            hue="cyan"
          />
        </Reveal>
        <Reveal delay={80}>
          <DiagnosisStoryPanel />
        </Reveal>
      </section>

      {/* ── Feature 2 — Just Ask ────────────────────────────────────────────── */}
      <section id="chat" className="relative z-10 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-cyan-50/80 via-white/0 to-orange-50/70" />
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
          <Reveal>
            <PanelHeader
              eyebrow="Just Ask Zevahealth"
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              title="Or just talk to it."
              subtitle="Type or speak. Zevahealth asks the right questions until the source is clear."
              hue="orange"
            />
          </Reveal>
          <Reveal delay={80}>
            <AIChatPanel />
          </Reveal>
        </div>
      </section>

      {/* ── Feature 3 — AI Form Coach ───────────────────────────────────────── */}
      <section id="coach" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
        <Reveal>
          <PanelHeader
            eyebrow="AI Form Coach"
            icon={<Camera className="h-3.5 w-3.5" />}
            title="A coach that watches every rep."
            subtitle="Pose tracking, joint angles, and live cues — your trainer in two megapixels."
            hue="cyan"
          />
        </Reveal>
        <Reveal delay={80}>
          <AICoachPanel />
        </Reveal>
      </section>

      {/* ── Why Zevahealth — benefits grid ──────────────────────────────────── */}
      <section id="why" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
        <Reveal>
          <PanelHeader
            eyebrow="Why Zevahealth"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            title="Three tools. One body model."
            subtitle="Everything you need to understand soreness and move better — in one bright, friendly place."
            hue="orange"
          />
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 80}>
              <div className="group h-full rounded-3xl border border-slate-900/5 bg-white p-7 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.3)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_-30px_rgba(15,23,42,0.4)]">
                <span className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${b.tile} transition group-hover:scale-110`}>
                  {b.icon}
                </span>
                <h3 className="text-lg font-bold text-slate-900">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{b.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-5 py-20 sm:px-8 lg:py-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-cyan-500 via-teal-500 to-cyan-600 p-10 text-center shadow-[0_40px_120px_-40px_rgba(8,145,178,0.8)] sm:p-16">
            {/* Decorative glows inside the card */}
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-orange-300/40 blur-[90px]" />
            <div className="pointer-events-none absolute -bottom-20 -left-12 h-64 w-64 rounded-full bg-white/30 blur-[90px]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

            <div className="relative">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-white backdrop-blur">
                <PlayCircle className="h-3.5 w-3.5" /> Free · in your browser
              </span>
              <h2 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-[-0.04em] text-white sm:text-6xl">
                Made to move with you.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-cyan-50">
                The first interactive muscle-target body model for everyday soreness relief. Find what hurts, then move
                through suggested exercises with your AI coach by your side.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a
                  href={diagnosticUrl}
                  className="group inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-slate-900 shadow-[0_18px_45px_-15px_rgba(0,0,0,0.4)] transition hover:-translate-y-0.5"
                >
                  Open Zevahealth AI <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href={atlasUrl}
                  className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  Explore the body <ChevronRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-slate-900/5 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-center sm:flex-row sm:px-8 sm:text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white">
              <ZevaLogo className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-slate-700">Zevahealth AI</span>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-slate-400">
            Built for every body. Suggestive, general-purpose movement guidance. Not a substitute for professional
            advice.
          </p>
        </div>
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </main>
  )
}

/* ───────────────────────────── Content data ───────────────────────────── */

const AUDIENCE = [
  'Desk workers',
  'Lifters',
  'Runners',
  'Weekend warriors',
  'Climbers',
  'Swimmers',
  'Cyclists',
  'New parents',
  'Yogis',
  'Gardeners',
]

const STATS: { value: string; label: string }[] = [
  { value: '100+', label: 'Muscles you can target' },
  { value: '3-in-1', label: 'Find · Ask · Coach' },
  { value: '0', label: 'Sign-ups required' },
  { value: 'Live', label: 'In-browser pose tracking' },
]

const BENEFITS: { title: string; body: string; icon: React.ReactNode; tile: string }[] = [
  {
    title: 'Find the source',
    body: 'Tap a sore spot on the 3D body and see the muscles most likely behind the hurt light up.',
    icon: <MousePointerClick className="h-6 w-6" />,
    tile: 'bg-cyan-100 text-cyan-600',
  },
  {
    title: 'Talk it through',
    body: 'Describe it in plain words. The AI asks smart follow-ups until the real source is clear.',
    icon: <MessageSquare className="h-6 w-6" />,
    tile: 'bg-orange-100 text-orange-500',
  },
  {
    title: 'Move with a coach',
    body: 'Live pose tracking counts your reps, measures joint angles, and cues your form in real time.',
    icon: <Gauge className="h-6 w-6" />,
    tile: 'bg-rose-100 text-rose-500',
  },
  {
    title: 'No barriers',
    body: 'No signup, no download, nothing to install. The whole experience runs right in your browser.',
    icon: <Zap className="h-6 w-6" />,
    tile: 'bg-teal-100 text-teal-600',
  },
]

/* ───────────────────────── Browser-style frame ───────────────────────── */

function BrowserFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-900/5 bg-white p-2.5 shadow-[0_50px_120px_-40px_rgba(15,23,42,0.55)] sm:p-3">
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <div className="mx-auto hidden items-center gap-2 rounded-full bg-slate-100 px-4 py-1 text-xs font-medium text-slate-400 sm:flex">
          <ShieldCheck className="h-3 w-3 text-emerald-500" />
          {label}
        </div>
        <div className="w-12" />
      </div>
      <div className="overflow-hidden rounded-[1.25rem] border border-slate-900/5 bg-slate-950">{children}</div>
    </div>
  )
}

/* Hero video — loops the diagnosis clip as the product showcase. */
function HeroVideo() {
  const [containerRef, inView] = useInView<HTMLDivElement>(0.2)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (inView) v.play().catch(() => {})
    else v.pause()
  }, [inView])

  return (
    <div ref={containerRef} className="relative aspect-video w-full">
      <video
        ref={videoRef}
        src={diagnosisVideoUrl}
        className="absolute inset-0 h-full w-full object-contain"
        autoPlay
        muted
        loop
        playsInline
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = 0.7
        }}
      />
    </div>
  )
}

/* ───────────────────────── Shared panel header ───────────────────────── */

function PanelHeader({
  eyebrow,
  icon,
  title,
  subtitle,
  hue = 'cyan',
}: {
  eyebrow: string
  icon: React.ReactNode
  title: string
  subtitle: string
  hue?: 'cyan' | 'orange'
}) {
  const pill =
    hue === 'cyan'
      ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
      : 'border-orange-200 bg-orange-50 text-orange-600'
  return (
    <div className="mb-10 text-center">
      <div className={`mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] ${pill}`}>
        {icon}
        {eyebrow}
      </div>
      <h2 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-[-0.04em] text-slate-900 sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-base text-slate-500 sm:text-lg">{subtitle}</p>
    </div>
  )
}

/* ───────────────── Feature 1: Diagnosis video w/ timed notes ───────────────── */

const diagnosisNotes = [
  { label: 'Step 1', text: 'Tap the spot that feels sore.', dwellMs: 2000 },
  { label: 'Step 2', text: 'See the likely muscle contributors light up.', dwellMs: 3000 },
  { label: 'Step 3', text: 'Isolate one — view its tension pattern.', dwellMs: 4000 },
  { label: 'Step 4', text: 'Try another. Confirm the real source.', dwellMs: 9000 },
  { label: 'Step 5', text: 'Done. Get suggested exercises tuned to your muscle.', dwellMs: 8000 },
]

function DiagnosisStoryPanel() {
  const [containerRef, inView] = useInView<HTMLDivElement>(0.3)
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastTimeRef = useRef(0)
  const [activeIdx, setActiveIdx] = useState(0)

  // Wall-clock step timer — only runs while panel is in view.
  useEffect(() => {
    if (!inView) return
    const t = window.setTimeout(() => {
      setActiveIdx((i) => (i + 1) % diagnosisNotes.length)
    }, diagnosisNotes[activeIdx].dwellMs)
    return () => window.clearTimeout(t)
  }, [activeIdx, inView])

  // Reset state and (re)start the video each time the panel scrolls into view;
  // pause it cleanly when it leaves.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (inView) {
      setActiveIdx(0)
      lastTimeRef.current = 0
      try {
        v.currentTime = 0
      } catch {}
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [inView])

  // Reset back to Step 1 every time the video loops (currentTime jumps back).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTimeUpdate = () => {
      if (v.currentTime + 0.4 < lastTimeRef.current) {
        setActiveIdx(0)
      }
      lastTimeRef.current = v.currentTime
    }
    const onSeeked = () => {
      if (v.currentTime < 0.4) setActiveIdx(0)
    }
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('seeked', onSeeked)
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('seeked', onSeeked)
    }
  }, [])

  const active = diagnosisNotes[activeIdx]

  return (
    <div
      ref={containerRef}
      className="relative rounded-[2rem] border border-slate-900/5 bg-white p-3 shadow-[0_40px_110px_-45px_rgba(15,23,42,0.5)]"
    >
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </div>

      {/* Mobile-only step note — sits ABOVE the video so it never overlaps
          the in-video UI (details panel, contributor labels, etc.). */}
      <div key={`m-${activeIdx}`} className="mm-fade-up mb-3 px-1 lg:hidden">
        <div className="rounded-xl border border-cyan-200 bg-cyan-50/80 px-3 py-2.5 text-center shadow-sm backdrop-blur">
          <div className="flex items-center justify-center gap-1">
            {diagnosisNotes.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === activeIdx ? 'w-5 bg-cyan-500' : 'w-3 bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-600">
            {active.label}
          </div>
          <div className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">{active.text}</div>
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-[1.25rem] border border-slate-900/5 bg-slate-950">
        <video
          ref={videoRef}
          src={diagnosisVideoUrl}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          muted
          loop
          playsInline
          onLoadedMetadata={(e) => {
            e.currentTarget.playbackRate = 0.65
          }}
        />

        {/* Desktop-only overlay step note — same content, kept floating
            over the model area at lg+ breakpoints. */}
        <div
          key={`d-${activeIdx}`}
          className="mm-fade-up pointer-events-none absolute hidden max-w-md -translate-x-1/2 lg:left-[38%] lg:top-6 lg:block"
        >
          <div className="rounded-2xl border border-slate-900/10 bg-white/95 px-5 py-4 text-center shadow-[0_20px_50px_-20px_rgba(15,23,42,0.5)] backdrop-blur">
            <div className="flex items-center justify-center gap-1.5">
              {diagnosisNotes.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeIdx ? 'w-7 bg-cyan-500' : 'w-5 bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <div className="mt-2.5 text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-600">
              {active.label}
            </div>
            <div className="mt-1 text-base font-semibold leading-snug text-slate-900 lg:text-lg">{active.text}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────── Feature 2: Animated AI chat + image result ───────────────── */

const chatScript: { sender: 'user' | 'ai'; text: string }[] = [
  { sender: 'user', text: 'I have a pain on my shoulder' },
  { sender: 'ai', text: 'Is it the front, back, or top of your shoulder, and is it on your left or right side?' },
  { sender: 'user', text: 'right side and the front' },
  { sender: 'ai', text: 'Does it shoot down your arm, or stay mostly in the shoulder itself?' },
  { sender: 'user', text: 'mostly in the shoulder' },
  { sender: 'ai', text: 'When does it feel worst — lifting your arm, pushing something away, or after sleeping on it?' },
  { sender: 'user', text: 'mostly when I lift my arm' },
  { sender: 'ai', text: 'How long has it been going on — days, weeks, or longer?' },
  { sender: 'user', text: 'couple of days' },
  { sender: 'ai', text: "Based on what you've described, here's my best read of likely sources." },
]

function AIChatPanel() {
  const [containerRef, inView] = useInView<HTMLDivElement>(0.25)
  const [count, setCount] = useState(0)
  const [typing, setTyping] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (inView) {
      setCount(0)
      setTyping(false)
      setShowResult(false)
    }
  }, [inView])

  useEffect(() => {
    if (!inView) return
    if (count >= chatScript.length) {
      const t = setTimeout(() => setShowResult(true), 700)
      return () => clearTimeout(t)
    }
    const next = chatScript[count]
    if (next.sender === 'ai') {
      setTyping(true)
      const t = setTimeout(() => {
        setTyping(false)
        setCount((c) => c + 1)
      }, 1200)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCount((c) => c + 1), count === 0 ? 700 : 900)
    return () => clearTimeout(t)
  }, [count, inView])

  useEffect(() => {
    if (!showResult || !inView) return
    const t = setTimeout(() => {
      setShowResult(false)
      setCount(0)
    }, 6500)
    return () => clearTimeout(t)
  }, [showResult, inView])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [count, typing])

  return (
    <div ref={containerRef} className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="flex h-[460px] flex-col overflow-hidden rounded-[2rem] border border-slate-900/5 bg-white shadow-[0_40px_110px_-45px_rgba(15,23,42,0.5)] sm:h-[520px] lg:h-[600px]">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <span className="font-bold text-slate-900">Zevahealth AI</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
            <Mic className="h-3.5 w-3.5 text-cyan-500" />
            Type or speak
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/40 px-5 py-5">
          {chatScript.slice(0, count).map((m, i) => (
            <ChatBubble key={i} sender={m.sender} text={m.text} />
          ))}
          {typing && <TypingBubble />}

          {/* Mobile-only: result appears as the final inline bubble so the
              chat reads as one continuous flow instead of two stacked boxes. */}
          {showResult && (
            <div className="mm-pop-in flex justify-start lg:hidden">
              <div className="w-full max-w-[92%] overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-lg">
                <img
                  src={chatBotImageAfter}
                  alt="Likely source: Deltoid (Anterior), 100% — primary zone"
                  className="block h-auto w-full"
                />
                <div className="border-t border-orange-100 bg-orange-50/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-500">
                  Likely source — shown on model
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white p-4">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            <span className="flex-1">Type your answer…</span>
            <Mic className="h-4 w-4 text-cyan-500" />
          </div>
        </div>
      </div>

      <div className="relative hidden aspect-[3/2] overflow-hidden rounded-[2rem] border border-slate-900/5 bg-slate-950 shadow-[0_40px_110px_-45px_rgba(15,23,42,0.5)] lg:block lg:aspect-auto lg:h-[600px]">
        <img
          src={chatBotImageBefore}
          alt=""
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-700 ease-out ${
            showResult ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <img
          src={chatBotImageAfter}
          alt="Zevahealth result — Deltoid (Anterior) 100%, primary zone"
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-700 ease-out ${
            showResult ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* Result caption chip */}
        <div
          className={`pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-orange-200 bg-white/95 px-4 py-2 text-xs font-semibold text-orange-600 shadow-lg backdrop-blur transition-opacity duration-700 ${
            showResult ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Likely source — shown on your body model
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ sender, text }: { sender: 'user' | 'ai'; text: string }) {
  const isUser = sender === 'user'
  return (
    <div className={`mm-pop-in flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? 'bg-gradient-to-br from-orange-500 to-rose-500 text-white'
            : 'border border-slate-200 bg-white text-slate-700'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="mm-pop-in flex justify-start">
      <div className="flex gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="mm-typing-dot h-2 w-2 rounded-full bg-slate-300" style={{ animationDelay: '0ms' }} />
        <span className="mm-typing-dot h-2 w-2 rounded-full bg-slate-300" style={{ animationDelay: '180ms' }} />
        <span className="mm-typing-dot h-2 w-2 rounded-full bg-slate-300" style={{ animationDelay: '360ms' }} />
      </div>
    </div>
  )
}

/* ───────────────── Feature 3: AI Coach with metric overlays ───────────────── */

function AICoachPanel() {
  const [containerRef, inView] = useInView<HTMLDivElement>(0.25)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (inView) {
      try {
        v.currentTime = 0
      } catch {}
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [inView])

  return (
    <div
      ref={containerRef}
      className="relative rounded-[2rem] border border-slate-900/5 bg-white p-3 shadow-[0_40px_110px_-45px_rgba(15,23,42,0.5)]"
    >
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-[1.25rem] border border-slate-900/5 bg-slate-950">
        <video
          ref={videoRef}
          src={aiCoachVideoUrl}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          muted
          loop
          playsInline
        />

        {/* Pose tracking badge — desktop overlay only. */}
        <div className="pointer-events-none absolute left-4 top-4 hidden rounded-xl border border-slate-900/10 bg-white/95 px-3 py-2 text-xs text-cyan-700 shadow-lg backdrop-blur sm:block">
          <div className="flex items-center gap-2">
            <span className="mm-pulse-soft h-1.5 w-1.5 rounded-full bg-cyan-500" />
            <span className="font-bold uppercase tracking-[0.22em]">Pose tracking</span>
          </div>
        </div>

        {/* Metrics — desktop overlay only. */}
        <div className="pointer-events-none absolute right-4 top-4 hidden flex-col gap-2 sm:flex">
          <Metric label="Joint angle" value="92°" hue="cyan" />
          <Metric label="Form score" value="87%" hue="orange" />
          <Metric label="Reps" value="4 / 8" hue="cyan" />
        </div>

        {/* Live cue — desktop overlay only (mobile version is below the video). */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 hidden w-[calc(100%-2rem)] max-w-md -translate-x-1/2 sm:block lg:bottom-6">
          <div className="rounded-2xl border border-orange-200 bg-white/95 px-5 py-4 text-center shadow-[0_20px_50px_-20px_rgba(15,23,42,0.5)] backdrop-blur">
            <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange-500">Live cue</div>
            <div className="mt-1.5 text-base font-semibold leading-snug text-slate-900 lg:text-lg">
              Slow the descent — control the eccentric.
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-only HUD strip — sits BELOW the video so it never covers
          the form-coaching footage. */}
      <div className="mt-3 space-y-2 px-1 sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[10px] text-cyan-700">
            <div className="flex items-center gap-1.5">
              <span className="mm-pulse-soft h-1 w-1 rounded-full bg-cyan-500" />
              <span className="font-bold uppercase tracking-[0.2em]">Pose tracking</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <MobileMetric label="Joint" value="92°" hue="cyan" />
            <MobileMetric label="Form" value="87%" hue="orange" />
            <MobileMetric label="Reps" value="4/8" hue="cyan" />
          </div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-orange-500">Live cue</div>
          <div className="mt-0.5 text-xs font-semibold leading-snug text-slate-900">
            Slow the descent — control the eccentric.
          </div>
        </div>
      </div>
    </div>
  )
}

function MobileMetric({ label, value, hue }: { label: string; value: string; hue: 'cyan' | 'orange' }) {
  const valueColor = hue === 'cyan' ? 'text-cyan-600' : 'text-orange-500'
  const borderColor = hue === 'cyan' ? 'border-cyan-200' : 'border-orange-200'
  return (
    <div className={`rounded-md border bg-white px-2 py-1 text-right shadow-sm ${borderColor}`}>
      <div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className={`text-xs font-bold leading-tight ${valueColor}`}>{value}</div>
    </div>
  )
}

function Metric({
  label,
  value,
  hue,
  hideOnMobile = false,
}: {
  label: string
  value: string
  hue: 'cyan' | 'orange'
  hideOnMobile?: boolean
}) {
  const valueColor = hue === 'cyan' ? 'text-cyan-600' : 'text-orange-500'
  const borderColor = hue === 'cyan' ? 'border-cyan-200' : 'border-orange-200'
  return (
    <div
      className={`min-w-[5rem] rounded-md border bg-white/95 px-2 py-1 text-right shadow-lg backdrop-blur sm:min-w-[7.5rem] sm:rounded-xl sm:px-3 sm:py-2 ${borderColor} ${
        hideOnMobile ? 'hidden sm:block' : ''
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:text-[10px] sm:tracking-[0.2em]">
        {label}
      </div>
      <div className={`text-xs font-bold sm:text-base ${valueColor}`}>{value}</div>
    </div>
  )
}
