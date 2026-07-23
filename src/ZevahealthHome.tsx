import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Bot,
  CalendarCheck,
  Camera,
  ChevronRight,
  Gauge,
  Heart,
  LogIn,
  LogOut,
  MessageSquare,
  Mic,
  MousePointerClick,
  Move3d,
  PlayCircle,
  Radar,
  Scale,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react'
import { useAuth } from './lib/auth/authContext'
import { AuthModal } from './components/auth/AuthModal'
import { MoveMateTrainNavLink, MoveMateTrainHeroCard } from './components/landing/MoveMateTrainPromo'
import { HeroStage } from './components/landing/HeroStage'
import { ReplayableVideo } from './components/landing/ReplayableVideo'
import { PlatformStage } from './components/landing/PlatformStage'

// MoveMate Train (the gym-training platform) isn't ready to launch, so its promo
// entry points are hidden on the published landing page. The content is preserved
// in components/landing/MoveMateTrainPromo.tsx — flip this to `true` to bring it
// back (the gym itself still runs at ?gym=1 regardless).
const SHOW_MOVEMATE_TRAIN = false

type ZevahealthHomeProps = {
  atlasUrl: string
  diagnosticUrl: string
  gymUrl: string
}

const diagnosisVideoUrl = new URL('../Videos/Shoulder-Deltoid/Diagnosis.mp4', import.meta.url).href
// Demo2 — the new AI-coach walkthrough footage (repo root, next to /Videos).
const aiCoachVideoUrl = new URL('../Demo2.mp4', import.meta.url).href
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

export function ZevahealthHome({ atlasUrl, diagnosticUrl, gymUrl }: ZevahealthHomeProps) {
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
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Zevahealth AI logo"
              className="h-10 w-10 object-contain"
            />
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
            {SHOW_MOVEMATE_TRAIN && <MoveMateTrainNavLink gymUrl={gymUrl} />}
            <a
              href={diagnosticUrl}
              title="Zevahealth Relief — pain & recovery platform"
              className="rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(244,63,94,0.7)] transition hover:shadow-[0_14px_36px_-8px_rgba(244,63,94,0.85)]"
            >
              Zevahealth Relief
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      {/* Hero deliberately breaks the max-width grid: text hugs the left edge and
          the showcase runs full-bleed to the right edge (no right margin) so the
          video + data boxes render large. Other sections keep the centered width. */}
      <section id="top" className="relative z-10 w-full pb-6 pt-6 sm:pt-10 lg:pt-14">
        {/* Free-form, draggable hero canvas (text + video + data boxes).
            Open with ?edit=1 to rearrange; see HeroStage.tsx. */}
        <HeroStage atlasUrl={atlasUrl} diagnosticUrl={diagnosticUrl} />
        {/* MoveMate Train promo parked until launch (SHOW_MOVEMATE_TRAIN). */}
        {SHOW_MOVEMATE_TRAIN && (
          <div className="mt-6 px-4 sm:px-8">
            <MoveMateTrainHeroCard gymUrl={gymUrl} />
          </div>
        )}
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
              <div className="zh-shine h-full rounded-3xl border border-slate-900/5 bg-white p-6 text-center shadow-[0_24px_60px_-35px_rgba(15,23,42,0.3)] transition hover:-translate-y-0.5">
                <div className="bg-gradient-to-r from-cyan-600 to-teal-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
                  {s.value}
                </div>
                <div className="mt-1.5 text-sm font-medium text-slate-500">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Explore the platform — clickable feature cards ──────────────────── */}
      <PlatformSection atlasUrl={atlasUrl} />

      {/* Separator between the feature-cards panel and the product videos */}
      <Reveal>
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-900/10 to-transparent" />
        </div>
      </Reveal>

      {/* ── Section header for the three product-video features ──────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 pt-12 sm:px-8 lg:pt-16">
        <Reveal>
          <PanelHeader
            eyebrow="How it works"
            icon={<MousePointerClick className="h-3.5 w-3.5" />}
            title="Diagnose, ask, and train."
            subtitle="Pinpoint the sore muscle on a 3D model, talk it through with the AI, then train with a coach that checks every rep."
            hue="orange"
          />
        </Reveal>
      </section>

      {/* ── Feature 1 — Pinpoint the muscle ─────────────────────────────────── */}
      <FeatureSplit
        id="pinpoint"
        eyebrow="Muscle Pain Diagnosis"
        icon={<ScanSearch className="h-3.5 w-3.5" />}
        title="Tap the spot. Find the source."
        subtitle="AI muscle pain diagnosis on an interactive 3D anatomy model — a sore shoulder becomes a named muscle with its tension pattern."
        hue="cyan"
      >
        <DiagnosisStoryPanel />
      </FeatureSplit>

      {/* ── Feature 2 — Just Ask ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-cyan-50/80 via-white/0 to-orange-50/70" />
        <FeatureSplit
          id="chat"
          eyebrow="Just Ask Zevahealth"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Or just talk to it."
          subtitle="Describe your muscle pain in plain words — the AI asks the right questions, then hands you targeted relief exercises."
          hue="orange"
        >
          <AIChatPanel />
        </FeatureSplit>
      </div>

      {/* ── Feature 3 — AI Form Coach ───────────────────────────────────────── */}
      <FeatureSplit
        id="coach"
        eyebrow="AI Workout Coach"
        icon={<Camera className="h-3.5 w-3.5" />}
        title="An AI workout coach on every rep."
        subtitle="Live form check and posture correction — pose tracking measures your joint angles and cues you mid-set, like a personal trainer in your camera."
        hue="cyan"
      >
        <AICoachPanel />
      </FeatureSplit>

      {/* ── Why Zevahealth — benefits grid ──────────────────────────────────── */}
      <section id="why" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
        <Reveal>
          <PanelHeader
            eyebrow="Why Zevahealth"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            title="Three tools. One body model."
            subtitle="Muscle pain diagnosis, relief exercises, and an AI workout coach — one interactive anatomy model, right in your browser."
            hue="orange"
          />
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 80}>
              <div className="zh-shine group h-full rounded-3xl border border-slate-900/5 bg-white p-7 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.3)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_-30px_rgba(15,23,42,0.4)]">
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
                The interactive muscle anatomy model for everyday muscle pain relief. Diagnose what hurts,
                get relief exercises tuned to that muscle, and train with your AI workout coach by your side.
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
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Zevahealth AI logo"
                className="h-9 w-9 object-contain"
              />
              <span className="text-sm font-semibold text-slate-700">Zevahealth AI</span>
            </div>

            {/* Owner & contact — required to be clearly visible for a .health site */}
            <div className="text-xs leading-relaxed text-slate-500">
              <div className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Site owner &amp; contact</div>
              <div className="text-slate-600">Amirreza Naseri</div>
              <div>Waltham, MA, USA</div>
              <a href="mailto:amir73rn@gmail.com" className="text-cyan-700 hover:underline">amir73rn@gmail.com</a>
            </div>

            {/* Sources — clinical/medical information must cite its sources */}
            <div className="max-w-xs text-xs leading-relaxed text-slate-500">
              <div className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Sources</div>
              Muscle, movement and pain information is based on standard anatomy and kinesiology references, including
              F.P. Kendall et&nbsp;al., <em>Muscles: Testing and Function</em>, and D.A. Neumann,
              <em> Kinesiology of the Musculoskeletal System</em>.
            </div>
          </div>

          {/* Medical disclaimer */}
          <p className="mt-8 border-t border-slate-900/5 pt-6 text-[11px] leading-relaxed text-slate-400">
            <span className="font-semibold text-slate-500">Medical disclaimer.</span> Zevahealth AI provides general,
            informational movement and muscle-education content and AI-assisted suggestions. It is not medical advice,
            diagnosis, or treatment, and is not a substitute for care from a licensed healthcare professional. Always
            consult a qualified professional about any medical condition or before starting an exercise program. If you
            think you may have a medical emergency, contact your local emergency services.
          </p>
        </div>
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode={authMode} />
    </main>
  )
}

/* ───────────────────────────── Content data ───────────────────────────── */

const AUDIENCE = [
  'Muscle pain relief exercises',
  'AI workout coach',
  'Posture correction',
  'Movement assessment',
  '3D muscle anatomy',
  'Form check',
  'Desk-neck & shoulder relief',
  'Runner recovery',
  'Mobility & stretching',
  'Workout routines by muscle',
]

const STATS: { value: string; label: string }[] = [
  { value: '100+', label: 'Muscles on the 3D anatomy model' },
  { value: '3-in-1', label: 'Diagnose · Relief exercises · AI coach' },
  { value: 'Free', label: 'AI muscle pain diagnosis' },
  { value: 'Live', label: 'Posture & form tracking in-browser' },
]

const BENEFITS: { title: string; body: string; icon: React.ReactNode; tile: string }[] = [
  {
    title: 'Muscle pain diagnosis',
    body: 'Tap a sore spot on the 3D anatomy model and see the muscles most likely behind the hurt light up, ranked.',
    icon: <MousePointerClick className="h-6 w-6" />,
    tile: 'bg-cyan-100 text-cyan-600',
  },
  {
    title: 'Relief exercises that fit',
    body: 'Get muscle pain relief exercises and stretches matched to the exact muscle — not a generic workout list.',
    icon: <MessageSquare className="h-6 w-6" />,
    tile: 'bg-orange-100 text-orange-500',
  },
  {
    title: 'AI workout coach',
    body: 'Live form check and posture correction: pose tracking counts reps, measures joint angles, and cues you mid-set.',
    icon: <Gauge className="h-6 w-6" />,
    tile: 'bg-rose-100 text-rose-500',
  },
  {
    title: 'Movement assessment',
    body: 'Measure your range of motion and symmetry over time — a full movement assessment with no wearables needed.',
    icon: <Zap className="h-6 w-6" />,
    tile: 'bg-teal-100 text-teal-600',
  },
]

/* ── Platform section data ───────────────────────────────────────────────────
   Two groups, mirroring how the tools actually relate: three ways to CAPTURE /
   analyse movement, and two RESULTS the platform builds from them. Colours match
   the in-app toolkit rail (twin=violet, assessment=cyan, remote=rose,
   program=orange, symmetry=teal) so the landing and the app read as one system. */
type PlatformTool = {
  title: string
  body: string
  icon: React.ReactNode
  tile: string
  /** Deep-link key — opens this feature straight inside the app. */
  feature: 'twin' | 'battery' | 'remote' | 'program' | 'symmetry'
  /** Emphasise the flagship card with a live-dot ring. */
  featured?: boolean
}

const ANALYZE_TOOLS: PlatformTool[] = [
  {
    title: 'Live Muscle Twin',
    body: 'Real-time motion analysis: watch muscle effort and fatigue build live as you move — a motion analyzer for any workout or activity.',
    icon: <Radar className="h-6 w-6" />,
    tile: 'bg-violet-100 text-violet-600',
    feature: 'twin',
    featured: true,
  },
  {
    title: 'Movement Assessment',
    body: "Checks every body segment's mobility and range of motion, measured by camera — no wearables to strap on.",
    icon: <Move3d className="h-6 w-6" />,
    tile: 'bg-cyan-100 text-cyan-600',
    feature: 'battery',
  },
  {
    title: 'Remote Assessment',
    body: 'The same live motion analysis as your Muscle Twin, run together over a video call.',
    icon: <Video className="h-6 w-6" />,
    tile: 'bg-rose-100 text-rose-500',
    feature: 'remote',
  },
]

const RESULT_TOOLS: PlatformTool[] = [
  {
    title: 'My AI Program',
    body: 'A personalized 4-week plan, generated automatically from your movement assessment results.',
    icon: <CalendarCheck className="h-6 w-6" />,
    tile: 'bg-orange-100 text-orange-500',
    feature: 'program',
  },
  {
    title: 'Symmetry Report',
    body: 'Left-vs-right balance, side by side — drawn straight from your assessment.',
    icon: <Scale className="h-6 w-6" />,
    tile: 'bg-teal-100 text-teal-600',
    feature: 'symmetry',
  },
]

/* Dark data-callout used around the movement showcase video (matches the
   original hero boxes: Digital Twin, Muscle Engagement, Left/Right, ROM). */
function ShowcaseCallout({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-2xl border border-white/12 bg-slate-900/90 px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur">
      <div className="text-[15px] font-bold leading-tight text-white">{title}</div>
      <div className="mt-0.5 text-[11px] font-medium leading-snug text-slate-400">{sub}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

/* The demo video (formerly the hero) + its four live-data callout boxes, kept
   in the same relative arrangement: Digital Twin overlaid top-left of the
   video, and Muscle Engagement / Left-Right / Range-of-Motion stacked to the
   right. Lives in the platform section now. */
function MovementShowcase() {
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
    <div className="flex flex-col gap-4">
      {/* Big video (plays once, replayable) + Digital Twin overlay */}
      <div className="relative">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-900/10 bg-[radial-gradient(circle_at_50%_35%,#111b34,#070b16)] shadow-[0_40px_90px_-45px_rgba(15,23,42,0.6)]">
          <ReplayableVideo src={mainVideoUrl} className="pointer-events-none h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="zh-scan absolute left-[4%] right-[4%] h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent shadow-[0_0_14px_2px_rgba(34,211,238,0.45)]" />
          </div>
        </div>
        <div className="absolute left-3 top-3 w-40 sm:w-52">
          <ShowcaseCallout title="Digital Twin" sub="Live motion & muscle tracking">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
          </ShowcaseCallout>
        </div>
      </div>

      {/* Three live-data boxes in a row beneath the enlarged video */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ShowcaseCallout title="Muscle Engagement" sub="What's firing, in real time">
          <LiveSparkline data={spark} gradId="ms-eng" />
        </ShowcaseCallout>
        <ShowcaseCallout title="Left / Right Balance" sub="Load symmetry across muscles">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div className="h-full bg-cyan-400 transition-all duration-700" style={{ width: `${bal}%` }} />
            <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${100 - bal}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-semibold tabular-nums">
            <span className="text-cyan-300">L {bal}%</span>
            <span className="text-amber-300">R {100 - bal}%</span>
          </div>
        </ShowcaseCallout>
        <ShowcaseCallout title="Range of Motion" sub="Every joint, as you move">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-all duration-700" style={{ width: `${rom}%` }} />
          </div>
          <div className="mt-1.5 text-right text-[11px] font-semibold tabular-nums text-emerald-300">{rom}% of range</div>
        </ShowcaseCallout>
      </div>
    </div>
  )
}

/* Explore-the-platform section — a PowerPoint-style editable stage (open the
   page with ?editp=1 to drag/resize) holding the movement video, its live-data
   boxes, and the five feature cards, all deep-linking into the app. */
function PlatformSection({ atlasUrl }: { atlasUrl: string }) {
  return (
    <section id="platform" className="relative z-10 mx-auto max-w-7xl px-5 pt-4 pb-6 sm:px-8 lg:pt-8">
      <Reveal>
        <PanelHeader
          eyebrow="Explore the platform"
          icon={<Radar className="h-3.5 w-3.5" />}
          title="See how your body really moves."
          subtitle="Three ways to capture how you move — then two reports the platform builds for you, automatically. Tap any to try it."
          hue="cyan"
        />
      </Reveal>
      <PlatformStage atlasUrl={atlasUrl} />
    </section>
  )
}

/* ───────────── Hero showcase — replayable product video + dynamic callouts ───────────── */

// The hero plays a looping screen capture of the Live Muscle Twin, with five
// "dynamic" callout cards that pop in over it to name what the viewer is seeing.
const mainVideoUrl = new URL('../MainVideoLanding.mp4', import.meta.url).href

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

// A small self-contained live sparkline used to make the plots feel dynamic.
function LiveSparkline({ data, gradId }: { data: number[]; gradId: string }) {
  const W = 128, H = 38
  const line = data
    .map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - (v / 100) * H).toFixed(1)}`)
    .join(' ')
  const area = `0,${H} ${line} ${W},${H}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-11 w-full overflow-visible">
      <defs>
        <linearGradient id={`${gradId}-line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={`${gradId}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId}-fill)`} />
      <polyline points={line} fill="none" stroke={`url(#${gradId}-line)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeroShowcase() {
  const [containerRef, inView] = useInView<HTMLDivElement>(0.2)
  const videoRef = useRef<HTMLVideoElement>(null)
  // How many callout boxes have popped in (0 = none yet). They reveal one by one
  // once the hero scrolls into view.
  const [shown, setShown] = useState(0)
  const [spark, setSpark] = useState<number[]>(() =>
    Array.from({ length: 20 }, (_, i) => 45 + Math.round(26 * Math.sin(i / 2.2))),
  )
  const [bal, setBal] = useState(55)   // left/right balance, % to the left
  const [rom, setRom] = useState(72)   // range-of-motion fill, %

  // Play/pause the loop with visibility; reveal the callouts in sequence.
  useEffect(() => {
    const v = videoRef.current
    if (inView) {
      try { if (v) v.currentTime = 0 } catch {}
      v?.play().catch(() => {})
      setShown(0)
      const ts = [350, 700, 1050, 1400, 1750].map((ms, i) =>
        window.setTimeout(() => setShown(i + 1), ms),
      )
      return () => ts.forEach((t) => window.clearTimeout(t))
    }
    v?.pause()
  }, [inView])

  // Drift the live values so the callout plots feel alive (only while on screen).
  useEffect(() => {
    if (!inView) return
    const id = window.setInterval(() => {
      setSpark((s) => [...s.slice(1), clamp(s[s.length - 1] + Math.round((Math.random() - 0.5) * 36), 12, 94)])
      setBal((b) => clamp(b + Math.round((Math.random() - 0.5) * 6), 44, 64))
      setRom((r) => clamp(r + Math.round((Math.random() - 0.5) * 14), 32, 96))
    }, 1100)
    return () => window.clearInterval(id)
  }, [inView])

  // Fade + rise reveal for a callout box.
  const reveal = (visible: boolean): React.CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.94)',
    transition: 'opacity 0.55s ease, transform 0.6s cubic-bezier(0.22,1,0.36,1)',
  })

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-2xl lg:max-w-none">
      {/* One framed unit: video on the LEFT, dynamic data boxes stacked to its
          RIGHT so they never cover the live readouts inside the video. */}
      <div className="rounded-[1.75rem] border border-slate-200/80 bg-white/50 p-3 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.45)] backdrop-blur-sm sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          {/* Video — dark stage */}
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-900/10 bg-[radial-gradient(circle_at_50%_35%,#111b34,#070b16)] lg:flex-1">
            <video
              ref={videoRef}
              src={mainVideoUrl}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
            {/* Sweeping live-scan line */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="zh-scan absolute left-[4%] right-[4%] h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent shadow-[0_0_14px_2px_rgba(34,211,238,0.45)]" />
            </div>
            {/* Digital Twin — the only overlay, on the empty top-left (no readout there) */}
            <div className="absolute left-3 top-3 hidden sm:block" style={reveal(shown >= 1)}>
              <CalloutCard title="Digital Twin" sub="Live motion & muscle tracking">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                </span>
              </CalloutCard>
            </div>
          </div>

          {/* Right column — data boxes OUTSIDE the video (2×2 on mobile) */}
          <div className="grid grid-cols-2 gap-3 lg:flex lg:w-80 lg:flex-col lg:justify-between lg:gap-4">
            <div style={reveal(shown >= 2)}>
              <CalloutCard title="Muscle Engagement" sub="What's firing, in real time" wide>
                <LiveSparkline data={spark} gradId="zh-cb2" />
              </CalloutCard>
            </div>
            <div style={reveal(shown >= 3)}>
              <CalloutCard title="Left / Right Balance" sub="Load symmetry across muscles" wide>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
                  <div className="h-full bg-cyan-400 transition-all duration-700" style={{ width: `${bal}%` }} />
                  <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${100 - bal}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] font-semibold tabular-nums">
                  <span className="text-cyan-300">L {bal}%</span>
                  <span className="text-amber-300">R {100 - bal}%</span>
                </div>
              </CalloutCard>
            </div>
            <div style={reveal(shown >= 4)}>
              <CalloutCard title="Engagement Map" sub="By group — arms, legs, trunk, neck" wide>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {['Upper', 'Lower', 'Trunk', 'Neck'].map((g, i) => (
                    <span key={g} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                      <span className="mm-pulse-soft h-2 w-2 rounded-full bg-cyan-400" style={{ animationDelay: `${i * 160}ms` }} />
                      {g}
                    </span>
                  ))}
                </div>
              </CalloutCard>
            </div>
            <div style={reveal(shown >= 5)}>
              <CalloutCard title="Range of Motion" sub="Every joint, as you move" wide>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700/60">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-300 transition-all duration-700" style={{ width: `${rom}%` }} />
                </div>
                <div className="mt-1.5 text-right text-[11px] font-semibold tabular-nums text-emerald-300">{rom}% of range</div>
              </CalloutCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A glass label card with a title, subtitle and a small live accent.
 *  `wide` fills the container width (used in the right-hand data column). */
function CalloutCard({ title, sub, children, wide = false }: { title: string; sub: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`${wide ? 'w-full' : 'w-max max-w-[16rem]'} rounded-2xl border border-white/12 bg-slate-900/85 px-4 py-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.75)] backdrop-blur`}>
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold leading-tight text-white sm:text-base">{title}</span>
      </div>
      <div className="mt-0.5 text-[11px] font-medium leading-snug text-slate-400 sm:text-xs">{sub}</div>
      <div className="mt-2.5">{children}</div>
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

/* ── Feature row: left-aligned heading on the left, live demo on the right ── */

function FeatureSplit({
  id,
  eyebrow,
  icon,
  title,
  subtitle,
  hue,
  children,
}: {
  id: string
  eyebrow: string
  icon: React.ReactNode
  title: string
  subtitle: string
  hue: 'cyan' | 'orange'
  children: React.ReactNode
}) {
  const pill =
    hue === 'cyan'
      ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
      : 'border-orange-200 bg-orange-50 text-orange-600'
  return (
    <section id={id} className="relative z-10 mx-auto w-full max-w-[112rem] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.54fr)_minmax(0,1.46fr)] lg:gap-16">
        <Reveal>
          <div className="text-center lg:text-left">
            <div className={`mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] ${pill}`}>
              {icon}
              {eyebrow}
            </div>
            <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-slate-900 sm:text-5xl lg:text-[3.5rem] lg:leading-[1.04]">{title}</h2>
            <p className="mx-auto mt-5 max-w-md text-base text-slate-500 sm:text-lg lg:mx-0">{subtitle}</p>
          </div>
        </Reveal>
        <Reveal delay={80}>{children}</Reveal>
      </div>
    </section>
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
      className="zh-glow-frame relative rounded-[2rem] border border-slate-900/5 bg-white p-3 shadow-[0_40px_110px_-45px_rgba(15,23,42,0.5)]"
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
    <div ref={containerRef} className="grid gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
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
            <div className="mm-pop-in flex justify-start xl:hidden">
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

      <div className="relative hidden aspect-[3/2] overflow-hidden rounded-[2rem] border border-slate-900/5 bg-slate-950 shadow-[0_40px_110px_-45px_rgba(15,23,42,0.5)] xl:block xl:aspect-auto xl:h-[600px]">
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
      className="zh-glow-frame relative rounded-[2rem] border border-slate-900/5 bg-white p-3 shadow-[0_40px_110px_-45px_rgba(15,23,42,0.5)]"
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
