import type React from 'react'
import { ArrowRight, Bot, ChevronRight, Sparkles, Zap } from 'lucide-react'
import { motion } from 'framer-motion'

type LandingPageProps = {
  atlasUrl: string
  diagnosticUrl: string
}

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.22 },
}

const diagnosisVideoUrl = new URL('../../../Videos/Shoulder-Deltoid/Diagnosis.mp4', import.meta.url).href
const aiCoachVideoUrl = new URL('../../../Videos/Shoulder-Deltoid/AICouch.mp4', import.meta.url).href


const landingAnimationCss = `
  @keyframes landing-chat-in {
    0%, 8% { opacity: 0; transform: translateY(14px) scale(0.98); }
    14%, 100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes landing-source-reveal {
    0%, 72% { opacity: 0; transform: translateY(16px) scale(0.97); filter: blur(4px); }
    84%, 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  }

  @keyframes landing-cue-loop {
    0%, 44% { opacity: 0.55; transform: translateY(10px); }
    56%, 100% { opacity: 1; transform: translateY(0); }
  }

  .landing-chat-message { opacity: 0; animation: landing-chat-in 7.2s ease-out infinite both; }
  .landing-source-highlight { animation: landing-source-reveal 7.2s ease-out infinite both; }
  .landing-cue { animation: landing-cue-loop 4.2s ease-in-out infinite alternate both; }
`

const triageMessages = [
  { role: 'user', text: 'I have a pain on my shoulder' },
  { role: 'ai', text: 'Is it the front, back, or top of your shoulder?' },
  { role: 'user', text: 'Right side and the front' },
  { role: 'ai', text: 'Does the pain stay near the shoulder or travel down the arm?' },
  { role: 'user', text: 'It stays there. A couple days.' },
  { role: 'ai', text: 'Likely source identified: Deltoid.' },
]

export function MoveMateLanding({ atlasUrl, diagnosticUrl }: LandingPageProps) {
  return (
    <main className="h-full min-h-screen overflow-y-auto bg-[#05070d] text-white selection:bg-cyan-300 selection:text-slate-950">
      <LandingAnimationStyles />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-14rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-cyan-500/16 blur-[130px]" />
        <div className="absolute bottom-0 right-[-12rem] h-[34rem] w-[34rem] rounded-full bg-orange-500/12 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[length:80px_80px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#05070d]/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="#top" className="group flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300/10 ring-1 ring-cyan-300/30 transition group-hover:bg-cyan-300/20 group-hover:shadow-[0_0_28px_rgba(34,211,238,0.35)]">
              <Zap className="h-5 w-5 text-cyan-200" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">MoveMate AI</span>
              <span className="block text-xs text-slate-400">Body insight + form coaching</span>
            </span>
          </a>
          <div className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a className="hover:text-white" href="#triage">Triage</a>
            <a className="hover:text-white" href="#diagnosis">Diagnosis</a>
            <a className="hover:text-white" href="#coach">Coach</a>
            <a className="hover:text-white" href="#mission">Mission</a>
          </div>
          <a href={diagnosticUrl} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition hover:border-cyan-200/70 hover:bg-cyan-300/20 hover:shadow-[0_0_36px_rgba(34,211,238,0.35)]">
            Open App
          </a>
        </div>
      </nav>

      <section id="top" className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-20 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:pt-28">
        <motion.div {...reveal} transition={{ duration: 0.7 }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-300 shadow-2xl backdrop-blur-2xl">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            Official MoveMate feature showcase
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-7xl lg:text-8xl">
            Find what hurts. Move better. Stay in flow.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Meet MoveMate AI—a calm body companion that turns your notes, taps, and reps into clear muscle insights and form feedback.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a href={diagnosticUrl} className="group inline-flex min-w-48 items-center justify-center gap-2 rounded-full bg-cyan-200 px-7 py-4 font-semibold text-slate-950 shadow-[0_0_44px_rgba(103,232,249,0.34)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_0_70px_rgba(103,232,249,0.55)]">
              Start Diagnostic <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
            <a href={atlasUrl} className="group inline-flex min-w-48 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 font-semibold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-orange-300/60 hover:bg-orange-300/10 hover:shadow-[0_0_50px_rgba(251,146,60,0.28)]">
              Explore Anatomy <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
          </div>
        </motion.div>
        <motion.div {...reveal} transition={{ duration: 0.75, delay: 0.1 }}>
          <MissionVisual compact />
        </motion.div>
      </section>

      <ShowcasePanel
        id="triage"
        eyebrow="Panel 1 · AI Triage"
        title="A real conversation flow that identifies the next best focus."
        description="Messages appear one by one, the background softens, and the leading source highlights only after the conversation has enough context."
      >
        <TriagePanel />
      </ShowcasePanel>

      <ShowcasePanel
        id="diagnosis"
        eyebrow="Panel 2 · Precision Diagnosis"
        title="Tap the body to see likely contributors snap into focus."
        description="This panel uses the provided Diagnosis video as the source visual, then layers a cursor, blueprint timing, and an isolate state on top."
        reverse
      >
        <DiagnosisPanel />
      </ShowcasePanel>

      <ShowcasePanel
        id="coach"
        eyebrow="Panel 3 · AI Coach"
        title="Reference, camera, cue, repeat."
        description="The provided coach video fills the full panel. The user side is privacy-forward: blurred feed, form-focused skeleton overlay, and a real-time cue."
      >
        <CoachPanel />
      </ShowcasePanel>

      <section id="mission" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <motion.div {...reveal} transition={{ duration: 0.7 }} className="grid items-center gap-10 rounded-[2rem] border border-white/12 bg-white/[0.055] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
          <MissionVisual />
          <div className="px-2 py-6 lg:px-6">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200/80">Panel 4 · The Core Mission</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Find what hurts. Move better. Stay in flow.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">Meet MoveMate AI—a calm body companion that turns your notes, taps, and reps into clear muscle insights and form feedback.</p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a href={diagnosticUrl} className="rounded-full bg-cyan-200 px-7 py-4 text-center font-semibold text-slate-950 transition hover:bg-white hover:shadow-[0_0_60px_rgba(103,232,249,0.45)]">Start Diagnostic</a>
              <a href={atlasUrl} className="rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 text-center font-semibold transition hover:border-orange-300/60 hover:bg-orange-300/10 hover:shadow-[0_0_44px_rgba(251,146,60,0.22)]">Explore Anatomy</a>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  )
}

function ShowcasePanel({ id, eyebrow, title, description, reverse = false, children }: { id: string; eyebrow: string; title: string; description: string; reverse?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <div className={`grid items-center gap-10 ${reverse ? 'lg:grid-cols-[1.15fr_0.85fr]' : 'lg:grid-cols-[0.85fr_1.15fr]'}`}>
        <motion.div {...reveal} transition={{ duration: 0.65 }} className={reverse ? 'lg:order-2' : ''}>
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-orange-200/80">{eyebrow}</p>
          <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{title}</h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">{description}</p>
        </motion.div>
        <motion.div {...reveal} transition={{ duration: 0.7, delay: 0.08 }} className={reverse ? 'lg:order-1' : ''}>{children}</motion.div>
      </div>
    </section>
  )
}

function TriagePanel() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="relative min-h-[620px] overflow-hidden rounded-[1.35rem] border border-white/12 bg-[#080d1d]">
        <video src={diagnosisVideoUrl} className="absolute inset-0 h-full w-full object-cover opacity-55 blur-[1px]" autoPlay muted loop playsInline />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_38%,rgba(34,211,238,0.12),transparent_32%),linear-gradient(90deg,rgba(15,23,42,0.94),rgba(15,23,42,0.58))]" />
        <div className="absolute inset-y-0 left-0 w-full max-w-[440px] border-r border-white/10 bg-[#0c1225]/96 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <span className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-orange-300" /> AI Diagnosis</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Voice mode OFF</span>
          </div>
          <div className="space-y-4 p-5 pt-8">
            {triageMessages.map((message, index) => (
              <div key={`${message.role}-${message.text}`} className={`landing-chat-message flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ animationDelay: `${index * 1.05}s` }}>
                <span className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-5 shadow-xl ${message.role === 'user' ? 'bg-orange-500 text-white' : 'bg-slate-700/90 text-slate-100'}`}>{message.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-y-0 left-[440px] right-0 hidden md:block">
          <video src={diagnosisVideoUrl} className="h-full w-full object-cover opacity-38 blur-[2px]" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-slate-950/60" />
          <div className="landing-source-highlight absolute left-[16%] top-[38%] rounded-2xl border border-orange-300/50 bg-black/65 p-5 shadow-[0_0_42px_rgba(251,146,60,0.34)] backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.28em] text-orange-200/80">Leading source</p>
            <div className="mt-2 flex items-center gap-6 text-xl font-semibold"><span>Deltoid</span><span className="text-orange-200">Primary</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DiagnosisPanel() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="relative aspect-[16/10] min-h-[520px] overflow-hidden rounded-[1.35rem] border border-white/12 bg-black">
        <video src={diagnosisVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
      </div>
    </div>
  )
}

function CoachPanel() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="relative aspect-[16/10] min-h-[520px] overflow-hidden rounded-[1.35rem] border border-white/12 bg-black">
        <video src={aiCoachVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
      </div>
    </div>
  )
}

function MissionVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.5rem] border border-white/12 bg-black shadow-[0_28px_110px_rgba(0,0,0,0.48)] ${compact ? 'aspect-[16/12]' : 'aspect-[16/10]'}`}>
      <div className="grid h-full grid-cols-2">
        <div className="relative overflow-hidden border-r border-white/10">
          <video src={diagnosisVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/24" />
        </div>
        <div className="relative overflow-hidden">
          <video src={aiCoachVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/24" />
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070d]/78 via-transparent to-[#05070d]/12" />
      <div className="absolute left-5 top-5 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-100 backdrop-blur-xl">MoveMate AI</div>
      <div className="landing-cue absolute bottom-5 left-5 right-5 rounded-2xl border border-white/12 bg-slate-950/68 p-5 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-200/80">Live movement loop</p>
        <p className="mt-2 text-xl font-semibold">Find the source, then coach the next rep.</p>
      </div>
    </div>
  )
}

function LandingAnimationStyles() {
  return <style dangerouslySetInnerHTML={{ __html: landingAnimationCss }} />
}
