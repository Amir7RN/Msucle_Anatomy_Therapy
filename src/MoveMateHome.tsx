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
  Zap,
} from 'lucide-react'

type MoveMateHomeProps = {
  atlasUrl: string
  diagnosticUrl: string
}

const diagnosisVideoUrl = new URL('../Videos/Shoulder-Deltoid/Diagnosis.mp4', import.meta.url).href
const aiCoachVideoUrl = new URL('../Videos/Shoulder-Deltoid/AICouch.mp4', import.meta.url).href

export function MoveMateHome({ atlasUrl, diagnosticUrl }: MoveMateHomeProps) {
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
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300/10 ring-1 ring-cyan-300/30">
              <Zap className="h-5 w-5 text-cyan-200" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">MoveMate AI</span>
              <span className="block text-xs text-slate-400">Your pocket body coach</span>
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
          Pain shouldn't be a{' '}
          <span className="bg-gradient-to-r from-orange-300 to-cyan-200 bg-clip-text text-transparent">mystery</span>.
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
          MoveMate AI is the body coach in your pocket. Find what hurts, talk to an AI, then train with live form
          feedback no gym membership can match.
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

      {/* Feature 1 — Visual Diagnosis */}
      <section id="diagnose" className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <PanelHeader
          eyebrow="Visual Diagnosis"
          icon={<ScanSearch className="h-3.5 w-3.5" />}
          title="Tap the spot. Find the source."
          subtitle="Watch how MoveMate turns a hand on a sore shoulder into a clear answer."
        />
        <DiagnosisStoryPanel />
      </section>

      {/* Feature 2 — AI Chat */}
      <section id="chat" className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <PanelHeader
          eyebrow="Conversational Diagnosis"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          title="Or just talk to it."
          subtitle="Type or speak. MoveMate asks the right questions until the source is clear."
        />
        <AIChatPanel />
      </section>

      {/* Feature 3 — AI Coach */}
      <section id="coach" className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <PanelHeader
          eyebrow="AI Form Coach"
          icon={<Camera className="h-3.5 w-3.5" />}
          title="A coach that watches every rep."
          subtitle="Pose estimation, joint angles, and live cues — your trainer in two megapixels."
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
            Nine out of ten of us will deal with serious muscle pain this year. MoveMate AI is the smarter way to figure
            it out — and the cheapest coach you'll ever have.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={diagnosticUrl}
              className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full bg-cyan-200 px-8 py-4 text-base font-semibold text-slate-950 shadow-[0_10px_40px_rgba(165,243,252,0.25)] transition hover:bg-white"
            >
              Open MoveMate AI <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/10 py-8 text-center text-xs text-slate-500">
        MoveMate AI — built for every body.
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
  { from: 0, to: 4, label: 'Step 1', text: 'Tap the spot that hurts.' },
  { from: 4, to: 7.5, label: 'Step 2', text: 'See likely muscle contributors light up.' },
  { from: 7.5, to: 11, label: 'Step 3', text: 'Isolate one — view its pain pattern.' },
  { from: 11, to: 14, label: 'Step 4', text: 'Try another. Confirm the real source.' },
  { from: 14, to: 999, label: 'Step 5', text: 'Done. Get exercises tuned to your muscle.' },
]

function DiagnosisStoryPanel() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const update = () => setTime(v.currentTime)
    v.addEventListener('timeupdate', update)
    return () => v.removeEventListener('timeupdate', update)
  }, [])

  const activeIdx = Math.max(
    0,
    diagnosisNotes.findIndex((n) => time >= n.from && time < n.to),
  )
  const active = diagnosisNotes[activeIdx]

  return (
    <div className="relative rounded-[2rem] border border-white/12 bg-slate-950/70 p-3 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl">
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
        />

        {/* Step pip indicator */}
        <div className="absolute right-4 top-4 flex gap-1.5">
          {diagnosisNotes.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-7 rounded-full transition-colors ${
                i === activeIdx ? 'bg-cyan-200' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Animated note */}
        <div
          key={activeIdx}
          className="mm-fade-up absolute bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md"
        >
          <div className="rounded-2xl border border-cyan-200/30 bg-slate-950/85 px-5 py-4 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/90">{active.label}</div>
            <div className="mt-1.5 text-base font-medium leading-snug text-white sm:text-lg">{active.text}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────── Feature 2: Animated AI chat + result ───────────────── */

const chatScript: { sender: 'user' | 'ai'; text: string }[] = [
  { sender: 'user', text: 'I have a pain on my shoulder' },
  { sender: 'ai', text: 'Is it the front, back, or top of your shoulder, and is it on your left or right side?' },
  { sender: 'user', text: 'right side and the front' },
  { sender: 'ai', text: 'Does the pain shoot down your arm, or stay mostly in the shoulder joint itself?' },
  { sender: 'user', text: 'mostly in the shoulder' },
  { sender: 'ai', text: 'When does it hurt most — lifting your arm, pushing something away, or after sleeping on it?' },
  { sender: 'user', text: 'mostly when I lift my arm' },
  { sender: 'ai', text: 'How long has this been going on — days, weeks, or longer?' },
  { sender: 'user', text: 'couple of days' },
  { sender: 'ai', text: "Based on what you've described, here's my best read of likely sources." },
]

function AIChatPanel() {
  const [count, setCount] = useState(0)
  const [typing, setTyping] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Drive the chat playback
  useEffect(() => {
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
  }, [count])

  // Loop the demo
  useEffect(() => {
    if (!showResult) return
    const t = setTimeout(() => {
      setShowResult(false)
      setCount(0)
    }, 6500)
    return () => clearTimeout(t)
  }, [showResult])

  // Auto-scroll chat to newest message
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [count, typing])

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* Chat side */}
      <div className="flex h-[600px] flex-col rounded-[2rem] border border-white/12 bg-slate-950/70 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-orange-300" />
            <span className="font-semibold">AI Diagnosis</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
            <Mic className="h-3.5 w-3.5" />
            Type or speak
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {chatScript.slice(0, count).map((m, i) => (
            <ChatBubble key={i} sender={m.sender} text={m.text} />
          ))}
          {typing && <TypingBubble />}
        </div>

        {/* Input bar */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-400">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            <span className="flex-1">Type your answer…</span>
            <Mic className="h-4 w-4 text-cyan-300" />
          </div>
        </div>
      </div>

      {/* Result side — mimic the in-app result panel */}
      <div className="relative h-[600px] overflow-hidden rounded-[2rem] border border-white/12 bg-[#05070d] shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl">
        {/* Subtle grid floor */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:48px_48px]" />
        {/* Anatomy backdrop from diagnosis video */}
        <video
          src={diagnosisVideoUrl}
          className="absolute inset-0 h-full w-full object-contain opacity-90"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#05070d]/85" />

        {/* Top chrome */}
        <div className="absolute left-4 top-4 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          Diagnostic Mode
        </div>
        <div className="absolute right-4 top-4 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-200 backdrop-blur">
          Movement Screen
        </div>

        {/* Bottom-left status badge */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[11px] text-emerald-200 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 mm-pulse-soft" />
          BodyParts3D real anatomy loaded (52 muscles)
        </div>

        {/* Result label box (animated in once chat completes) */}
        <div
          className={`pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 transition-all duration-700 ${
            showResult ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
          }`}
        >
          <div className="relative">
            <div className="rounded-2xl border-2 border-orange-300/70 bg-black/75 px-5 py-4 shadow-[0_0_44px_rgba(251,146,60,0.4)] backdrop-blur-xl">
              <div className="flex items-baseline gap-5">
                <span className="text-base font-semibold text-white sm:text-lg">Deltoid (Anterior)</span>
                <span className="text-base font-bold text-orange-300 sm:text-lg">100%</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-orange-200/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-300" />
                Primary zone
              </div>
            </div>
            {/* Leader line + dot */}
            <div className="absolute left-full top-1/2 hidden h-px w-20 -translate-y-1/2 bg-orange-300/70 sm:block" />
            <div className="absolute left-[calc(100%+5rem)] top-1/2 hidden h-3 w-3 -translate-y-1/2 rounded-full bg-orange-300 shadow-[0_0_16px_rgba(251,146,60,0.7)] sm:block" />
          </div>
        </div>

        {/* Helper caption */}
        <div
          className={`pointer-events-none absolute bottom-4 right-4 max-w-xs rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-xs text-slate-300 backdrop-blur transition duration-500 ${
            showResult ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="font-semibold text-cyan-200">Likely sources — shown on model.</span>
          <span className="mt-1 block text-slate-400">Click any label to lock in the muscle and see exercises.</span>
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
  return (
    <div className="relative rounded-[2rem] border border-white/12 bg-slate-950/70 p-3 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
        <video
          src={aiCoachVideoUrl}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          muted
          loop
          playsInline
        />

        {/* Pose tracking badge */}
        <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-cyan-200/30 bg-slate-950/80 px-3 py-2 text-xs text-cyan-100 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="mm-pulse-soft h-1.5 w-1.5 rounded-full bg-cyan-300" />
            <span className="font-semibold uppercase tracking-[0.22em]">Pose tracking · live</span>
          </div>
        </div>

        {/* HUD metrics stack */}
        <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-2">
          <Metric label="Joint angle" value="92°" hue="cyan" />
          <Metric label="Form score" value="87%" hue="orange" />
          <Metric label="Reps" value="4 / 8" hue="cyan" />
        </div>

        {/* Live cue */}
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md">
          <div className="rounded-2xl border border-orange-200/30 bg-slate-950/85 px-5 py-4 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-200/90">Live cue</div>
            <div className="mt-1.5 text-base font-medium leading-snug text-white sm:text-lg">
              Slow the descent — control the eccentric.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, hue }: { label: string; value: string; hue: 'cyan' | 'orange' }) {
  const valueColor = hue === 'cyan' ? 'text-cyan-200' : 'text-orange-200'
  const borderColor = hue === 'cyan' ? 'border-cyan-200/30' : 'border-orange-200/30'
  return (
    <div className={`min-w-[7.5rem] rounded-xl border bg-slate-950/80 px-3 py-2 text-right backdrop-blur-xl ${borderColor}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`text-base font-semibold ${valueColor}`}>{value}</div>
    </div>
  )
}
