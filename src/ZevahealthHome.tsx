import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Camera,
  ChevronRight,
  MessageSquare,
  Mic,
  ScanSearch,
  Sparkles,
} from 'lucide-react'

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

export function ZevahealthHome({ atlasUrl, diagnosticUrl }: ZevahealthHomeProps) {
  return (
    <main className="h-full min-h-screen overflow-y-auto bg-[#05070d] text-white">
      {/* Background ambience */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:80px_80px]" />
      <div className="pointer-events-none fixed left-1/2 top-[-14rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-cyan-400/15 blur-[130px]" />
      <div className="pointer-events-none fixed bottom-[-10rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-orange-400/10 blur-[120px]" />

      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#05070d]/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300/10 ring-1 ring-cyan-300/30 text-cyan-200">
              <ZevaLogo className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">Zevahealth AI</span>
              <span className="block text-xs text-slate-400">Move smarter. Feel better.</span>
            </span>
          </a>
          <a
            href={diagnosticUrl}
            className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20"
          >
            Open App
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section id="top" className="relative z-10 mx-auto max-w-5xl px-5 pb-12 pt-20 text-center sm:px-8 lg:pt-28">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-300 backdrop-blur-2xl">
          <Sparkles className="h-4 w-4 text-cyan-200" />
          For everyone with a body — desk workers, lifters, runners, weekend warriors
        </div>
        <h1 className="mx-auto max-w-4xl text-5xl font-semibold tracking-[-0.05em] sm:text-7xl lg:text-8xl">
          Sore spots shouldn't be a{' '}
          <span className="bg-gradient-to-r from-orange-300 to-cyan-200 bg-clip-text text-transparent">mystery</span>.
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
          Talk to the AI or pinpoint the muscle behind the hurt. Then move through suggested exercises with your AI
          coach — and feel better.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={diagnosticUrl}
            className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-cyan-200 px-8 py-4 text-base font-semibold text-slate-950 shadow-[0_10px_40px_rgba(165,243,252,0.25)] transition hover:bg-white"
          >
            Try it free <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={atlasUrl}
            className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-8 py-4 text-base font-semibold backdrop-blur-xl transition hover:border-orange-300/60 hover:bg-orange-300/10"
          >
            Explore the body <ChevronRight className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-6 text-sm text-slate-500">No signup. No download. Works in your browser.</p>
      </section>

      {/* Feature 1 — Pinpoint the muscle */}
      <section id="pinpoint" className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <PanelHeader
          eyebrow="Pinpoint the Muscle"
          icon={<ScanSearch className="h-3.5 w-3.5" />}
          title="Tap the spot. Find the source."
          subtitle="Watch how Zevahealth turns a hand on a sore shoulder into a clear answer."
        />
        <DiagnosisStoryPanel />
      </section>

      {/* Feature 2 — Just Ask */}
      <section id="chat" className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <PanelHeader
          eyebrow="Just Ask Zevahealth"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Or just talk to it."
          subtitle="Type or speak. Zevahealth asks the right questions until the source is clear."
        />
        <AIChatPanel />
      </section>

      {/* Feature 3 — AI Form Coach */}
      <section id="coach" className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <PanelHeader
          eyebrow="AI Form Coach"
          icon={<Camera className="h-3.5 w-3.5" />}
          title="A coach that watches every rep."
          subtitle="Pose tracking, joint angles, and live cues — your trainer in two megapixels."
        />
        <AICoachPanel />
      </section>

      {/* Final CTA */}
      <section className="relative z-10 mx-auto max-w-5xl px-5 py-24 sm:px-8 lg:py-32">
        <div className="overflow-hidden rounded-[2rem] border border-white/12 bg-gradient-to-br from-cyan-300/10 via-white/[0.04] to-orange-300/10 p-10 text-center shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl sm:p-16">
          <h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
            Your body deserves better than YouTube tutorials.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            The first interactive muscle-target body model for everyday soreness relief. Find what hurts, then move
            through suggested exercises with your AI coach by your side.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={diagnosticUrl}
              className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-cyan-200 px-8 py-4 text-base font-semibold text-slate-950 shadow-[0_10px_40px_rgba(165,243,252,0.25)] transition hover:bg-white"
            >
              Open Zevahealth AI <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 py-8 text-center text-xs text-slate-500">
        Zevahealth AI — built for every body. Suggestive, general-purpose movement guidance. Not a substitute for
        professional advice.
      </footer>
    </main>
  )
}

/* ───────────────────────── Shared panel header ───────────────────────── */

function PanelHeader({
  eyebrow,
  icon,
  title,
  subtitle,
}: {
  eyebrow: string
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-10 text-center">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-200/30 bg-orange-200/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-200">
        {icon}
        {eyebrow}
      </div>
      <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">{subtitle}</p>
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
      className="relative rounded-[2rem] border border-white/12 bg-slate-950/70 p-3 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
    >
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
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

        <div
          key={activeIdx}
          className="mm-fade-up pointer-events-none absolute left-1/2 top-2 w-[calc(100%-1rem)] max-w-[14rem] -translate-x-1/2 sm:top-4 sm:max-w-md lg:left-[38%] lg:top-6"
        >
          <div className="rounded-xl border border-cyan-200/30 bg-slate-950/85 px-2.5 py-2 text-center shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:rounded-2xl sm:px-5 sm:py-4">
            <div className="flex items-center justify-center gap-1 sm:gap-1.5">
              {diagnosisNotes.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all sm:h-1.5 ${
                    i === activeIdx ? 'w-4 bg-cyan-200 sm:w-7' : 'w-3 bg-white/20 sm:w-5'
                  }`}
                />
              ))}
            </div>
            <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-200/90 sm:mt-2.5 sm:text-[11px] sm:tracking-[0.28em]">
              {active.label}
            </div>
            <div className="mt-0.5 text-xs font-medium leading-snug text-white sm:mt-1 sm:text-base lg:text-lg">
              {active.text}
            </div>
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
      <div className="flex h-[460px] flex-col rounded-[2rem] border border-white/12 bg-slate-950/70 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl sm:h-[520px] lg:h-[600px]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-orange-300" />
            <span className="font-semibold">Zevahealth AI</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
            <Mic className="h-3.5 w-3.5" />
            Type or speak
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {chatScript.slice(0, count).map((m, i) => (
            <ChatBubble key={i} sender={m.sender} text={m.text} />
          ))}
          {typing && <TypingBubble />}
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            <span className="flex-1">Type your answer…</span>
            <Mic className="h-4 w-4 text-cyan-300" />
          </div>
        </div>
      </div>

      <div className="relative aspect-[3/2] overflow-hidden rounded-[2rem] border border-white/12 bg-[#05070d] shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl lg:aspect-auto lg:h-[600px]">
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
      </div>
    </div>
  )
}

function ChatBubble({ sender, text }: { sender: 'user' | 'ai'; text: string }) {
  const isUser = sender === 'user'
  return (
    <div className={`mm-pop-in flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-lg ${
          isUser ? 'bg-orange-500 text-white' : 'bg-slate-800/90 text-slate-100'
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
      <div className="flex gap-1.5 rounded-2xl bg-slate-800/90 px-4 py-3 shadow-lg">
        <span className="mm-typing-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
        <span className="mm-typing-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: '180ms' }} />
        <span className="mm-typing-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: '360ms' }} />
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
      className="relative rounded-[2rem] border border-white/12 bg-slate-950/70 p-3 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl"
    >
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
        <video
          ref={videoRef}
          src={aiCoachVideoUrl}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          muted
          loop
          playsInline
        />

        <div className="pointer-events-none absolute left-2 top-2 rounded-lg border border-cyan-200/30 bg-slate-950/80 px-2 py-1 text-[10px] text-cyan-100 backdrop-blur-xl sm:left-4 sm:top-4 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="mm-pulse-soft h-1 w-1 rounded-full bg-cyan-300 sm:h-1.5 sm:w-1.5" />
            <span className="font-semibold uppercase tracking-[0.18em] sm:tracking-[0.22em]">Pose tracking</span>
          </div>
        </div>

        <div className="pointer-events-none absolute right-2 top-2 flex flex-col gap-1.5 sm:right-4 sm:top-4 sm:gap-2">
          <Metric label="Joint angle" value="92°" hue="cyan" />
          <Metric label="Form score" value="87%" hue="orange" hideOnMobile />
          <Metric label="Reps" value="4 / 8" hue="cyan" hideOnMobile />
        </div>

        <div className="pointer-events-none absolute bottom-2 left-1/2 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 sm:bottom-4 sm:w-[calc(100%-2rem)] lg:bottom-6">
          <div className="rounded-xl border border-orange-200/30 bg-slate-950/85 px-3 py-2 text-center shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:rounded-2xl sm:px-5 sm:py-4">
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-orange-200/90 sm:text-[11px] sm:tracking-[0.28em]">
              Live cue
            </div>
            <div className="mt-0.5 text-xs font-medium leading-snug text-white sm:mt-1.5 sm:text-base lg:text-lg">
              Slow the descent — control the eccentric.
            </div>
          </div>
        </div>
      </div>
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
  const valueColor = hue === 'cyan' ? 'text-cyan-200' : 'text-orange-200'
  const borderColor = hue === 'cyan' ? 'border-cyan-200/30' : 'border-orange-200/30'
  return (
    <div
      className={`min-w-[5rem] rounded-md border bg-slate-950/80 px-2 py-1 text-right backdrop-blur-xl sm:min-w-[7.5rem] sm:rounded-xl sm:px-3 sm:py-2 ${borderColor} ${
        hideOnMobile ? 'hidden sm:block' : ''
      }`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:text-[10px] sm:tracking-[0.2em]">
        {label}
      </div>
      <div className={`text-xs font-semibold sm:text-base ${valueColor}`}>{value}</div>
    </div>
  )
}
