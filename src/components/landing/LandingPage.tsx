import type React from 'react'
import { Activity, ArrowRight, Bot, CheckCircle2, ChevronRight, MousePointer2, Sparkles, Zap } from 'lucide-react'
import { motion } from 'framer-motion'

type LandingPageProps = {
  atlasUrl: string
  diagnosticUrl: string
}

const reveal = {
  initial: { opacity: 0, y: 34 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.28 },
}

const chatMessages = [
  { role: 'you', text: 'I have pain on my shoulder.' },
  { role: 'ai', text: 'Is it the front, back, or top of your shoulder?' },
  { role: 'you', text: 'Right side and the front.' },
  { role: 'ai', text: 'Does it shoot down your arm, or stay near the shoulder?' },
  { role: 'you', text: 'It stays mostly there. A couple days.' },
  { role: 'ai', text: 'Likely sources found. Deltoid is the strongest match.' },
]

const contributors = [
  { name: 'Deltoid', value: '30%', label: 'Primary zone' },
  { name: 'Biceps Brachii', value: '15%', label: 'Primary zone' },
  { name: 'Pectoralis Major', value: '15%', label: 'Primary zone' },
]

const diagnosisVideoUrl = new URL('../../../Videos/Shoulder-Deltoid/Diagnosis.mp4', import.meta.url).href
const aiCoachVideoUrl = new URL('../../../Videos/Shoulder-Deltoid/AICouch.mp4', import.meta.url).href

export function LandingPage({ atlasUrl, diagnosticUrl }: LandingPageProps) {
  return (
    <main className="h-full min-h-screen overflow-y-auto bg-[#05070d] text-white selection:bg-cyan-300 selection:text-slate-950">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-12rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-orange-500/10 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(148,163,184,0.16),transparent_36%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:100%_100%,76px_76px,76px_76px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#05070d]/70 backdrop-blur-2xl">
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
            <a className="hover:text-white" href="#triage">AI Triage</a>
            <a className="hover:text-white" href="#diagnostic">Pain Map</a>
            <a className="hover:text-white" href="#coach">Live Coach</a>
          </div>
          <a href={diagnosticUrl} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition hover:border-cyan-200/70 hover:bg-cyan-300/20 hover:shadow-[0_0_36px_rgba(34,211,238,0.35)]">
            Open App
          </a>
        </div>
      </nav>

      <section id="top" className="relative mx-auto flex max-w-7xl flex-col items-center px-5 pb-24 pt-20 text-center sm:px-8 lg:pt-28">
        <motion.div {...reveal} transition={{ duration: 0.7 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-300 shadow-2xl backdrop-blur-2xl">
          <Sparkles className="h-4 w-4 text-cyan-200" />
          Everyday movement guidance, powered by your interactive body map
        </motion.div>
        <motion.h1 {...reveal} transition={{ duration: 0.7, delay: 0.08 }} className="max-w-5xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-7xl lg:text-8xl">
          Find what hurts. Move better. Stay in flow.
        </motion.h1>
        <motion.p {...reveal} transition={{ duration: 0.7, delay: 0.16 }} className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
          Meet MoveMate AI — a calm body companion that turns your notes, taps, and reps into clear muscle insights and form feedback.
        </motion.p>
        <motion.div {...reveal} transition={{ duration: 0.7, delay: 0.24 }} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href={diagnosticUrl} className="group inline-flex min-w-48 items-center justify-center gap-2 rounded-full bg-cyan-200 px-7 py-4 font-semibold text-slate-950 shadow-[0_0_44px_rgba(103,232,249,0.34)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_0_70px_rgba(103,232,249,0.55)]">
            Start Diagnostic <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </a>
          <a href={atlasUrl} className="group inline-flex min-w-48 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 font-semibold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-orange-300/60 hover:bg-orange-300/10 hover:shadow-[0_0_50px_rgba(251,146,60,0.28)]">
            Explore Anatomy <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </a>
        </motion.div>

        <motion.div {...reveal} transition={{ duration: 0.8, delay: 0.32 }} className="relative mt-16 w-full max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-[0_30px_140px_rgba(0,0,0,0.55)] backdrop-blur-3xl sm:p-6">
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <HeroBodyModel />
        </motion.div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Conversation first', 'Describe the ache in plain language. MoveMate replies one step at a time.'],
            ['Tap to compare', 'Click a shoulder pain point and see likely contributors as clean schematic cards.'],
            ['Coach every rep', 'Follow a reference clip while the live skeleton checks angle and form cues.'],
          ].map(([title, text], index) => (
            <motion.article key={title} {...reveal} transition={{ duration: 0.55, delay: index * 0.08 }} className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl transition hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-white/[0.08] hover:shadow-[0_0_52px_rgba(34,211,238,0.16)]">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-200/80">0{index + 1}</p>
              <h3 className="mt-4 text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <FeatureSection id="triage" eyebrow="AI Triage" title="It starts like a conversation — not a complicated chart." description="Messages appear one by one, then MoveMate highlights Deltoid as the leading source so the person can select it and isolate the pattern.">
        <ChatTriageDemo />
      </FeatureSection>

      <FeatureSection id="diagnostic" eyebrow="Precision Diagnostic" title="Tap the shoulder. Watch the likely contributors snap into focus." description="A lightweight schematic recreates the 3D tool: pain point, blueprint leaders, ranked contributors, and an isolate state for Biceps Brachii.">
        <DiagnosticClickDemo />
      </FeatureSection>

      <FeatureSection id="coach" eyebrow="AI Coach" title="A closed loop for practice: reference, camera, cue, repeat." description="The live form panel uses a stylized skeleton overlay rather than showing a real person, keeping the page polished and privacy-friendly.">
        <CoachDemo />
      </FeatureSection>

      <section className="relative mx-auto max-w-5xl px-5 py-24 text-center sm:px-8">
        <motion.div {...reveal} className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-10 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl sm:p-14">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">Ready to meet your movement map?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-slate-300">Start with a shoulder example, isolate Deltoid or Biceps Brachii, then move into guided reps when you are ready.</p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <a href={diagnosticUrl} className="rounded-full bg-cyan-200 px-7 py-4 font-semibold text-slate-950 transition hover:bg-white hover:shadow-[0_0_60px_rgba(103,232,249,0.45)]">Start Diagnostic</a>
            <a href={atlasUrl} className="rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 font-semibold transition hover:border-orange-300/60 hover:bg-orange-300/10 hover:shadow-[0_0_44px_rgba(251,146,60,0.22)]">Explore Anatomy</a>
          </div>
        </motion.div>
      </section>
    </main>
  )
}

function FeatureSection({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:py-32">
      <motion.div {...reveal} transition={{ duration: 0.65 }}>
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-orange-200/80">{eyebrow}</p>
        <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{title}</h2>
        <p className="mt-6 text-lg leading-8 text-slate-300">{description}</p>
      </motion.div>
      <motion.div {...reveal} transition={{ duration: 0.7, delay: 0.12 }}>{children}</motion.div>
    </section>
  )
}

function HeroBodyModel() {
  return (
    <div className="relative min-h-[520px] overflow-hidden rounded-[1.5rem] bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.14),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.4),rgba(2,6,23,0.88))]">
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:56px_56px] [transform:perspective(700px)_rotateX(62deg)] [transform-origin:bottom]" />
      <div className="absolute left-1/2 top-1/2 h-[410px] w-[250px] -translate-x-1/2 -translate-y-1/2 animate-[landing-float_5s_ease-in-out_infinite]">
        <AnatomyFigure className="h-full w-full animate-[landing-rotate_12s_linear_infinite] opacity-90" />
      </div>
      <div className="absolute left-8 top-8 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-sm text-cyan-100 backdrop-blur-xl">Ghost anatomy mode</div>
      <div className="absolute bottom-8 left-8 right-8 grid gap-3 sm:grid-cols-3">
        {['Deltoid focus', 'Motion cues', 'Pain patterns'].map((item) => (
          <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-left backdrop-blur-2xl">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            <p className="mt-3 text-sm font-semibold">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function AnatomyFigure({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 210 390" className={className} fill="none" aria-hidden="true">
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <ellipse cx="105" cy="42" rx="31" ry="34" fill="rgba(226,232,240,.18)" stroke="rgba(255,255,255,.26)" />
      <path d="M83 76 C67 98 61 137 70 186 C77 226 71 282 58 356" stroke="rgba(226,232,240,.28)" strokeWidth="16" strokeLinecap="round" />
      <path d="M127 76 C143 98 149 137 140 186 C133 226 139 282 152 356" stroke="rgba(226,232,240,.28)" strokeWidth="16" strokeLinecap="round" />
      <path d="M75 91 C55 113 40 150 35 215" stroke="rgba(148,163,184,.32)" strokeWidth="14" strokeLinecap="round" />
      <path d="M135 91 C155 113 170 150 175 215" stroke="rgba(148,163,184,.32)" strokeWidth="14" strokeLinecap="round" />
      <path d="M71 90 C92 78 118 78 139 90 C151 138 144 200 130 226 C114 240 95 240 80 226 C66 198 59 139 71 90Z" fill="rgba(255,255,255,.22)" stroke="rgba(255,255,255,.3)" />
      <path d="M71 99 C54 110 46 133 43 157 C59 154 72 140 78 111Z" fill="rgba(236,72,153,.52)" filter="url(#glow)" />
      <path d="M139 99 C156 110 164 133 167 157 C151 154 138 140 132 111Z" fill="rgba(125,211,252,.42)" />
      <path d="M86 96 C96 131 96 179 82 222" stroke="rgba(251,146,60,.65)" strokeWidth="9" strokeLinecap="round" />
      <path d="M124 96 C114 131 114 179 128 222" stroke="rgba(34,211,238,.5)" strokeWidth="9" strokeLinecap="round" />
      <path d="M76 229 C61 267 57 310 59 365" stroke="rgba(196,181,253,.44)" strokeWidth="18" strokeLinecap="round" />
      <path d="M134 229 C149 267 153 310 151 365" stroke="rgba(167,243,208,.38)" strokeWidth="18" strokeLinecap="round" />
      <circle cx="61" cy="118" r="13" fill="rgba(236,72,153,.65)" filter="url(#glow)" />
    </svg>
  )
}

function ChatTriageDemo() {
  return (
    <div className="grid gap-5 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-3xl lg:grid-cols-[0.72fr_1fr]">
      <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/65 p-4">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
          <span className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-orange-300" /> AI Diagnosis</span>
          <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">Voice off</span>
        </div>
        <div className="space-y-3">
          {chatMessages.map((message, index) => (
            <div key={`${message.text}-${index}`} className={`landing-chat-message flex ${message.role === 'you' ? 'justify-end' : 'justify-start'}`} style={{ animationDelay: `${index * 1.1}s` }}>
              <span className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-5 ${message.role === 'you' ? 'bg-orange-500 text-white' : 'bg-white/10 text-slate-100'}`}>{message.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="relative min-h-[420px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#121210] p-5">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.45em] text-orange-300/45">Likely sources schematic</p>
        <div className="absolute left-1/2 top-24 h-64 w-40 -translate-x-1/2 opacity-80"><AnatomyFigure className="h-full w-full" /></div>
        <div className="landing-deltoid-card absolute left-6 top-44 rounded-xl border border-orange-400/45 bg-black/55 p-4 shadow-[0_0_28px_rgba(245,158,11,0.28)] backdrop-blur-xl">
          <div className="flex items-center gap-5 font-semibold"><span>Deltoid (Anterior)</span><span className="text-orange-200">100%</span></div>
          <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">● Primary zone</p>
        </div>
        <div className="landing-deltoid-card absolute right-7 top-44 h-0.5 w-56 bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.9)]" />
        <div className="landing-isolate-card absolute bottom-6 right-6 w-56 rounded-2xl border border-pink-300/35 bg-pink-400/10 p-4 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Isolate</span><span className="rounded-full bg-pink-300/20 px-2 py-1 text-xs text-pink-100">Deltoid</span></div>
          <div className="h-28 rounded-xl bg-[radial-gradient(circle_at_50%_30%,rgba(244,114,182,0.8),transparent_24%),radial-gradient(circle_at_38%_55%,rgba(239,68,68,0.45),transparent_18%),rgba(15,23,42,0.85)] ring-1 ring-white/10" />
        </div>
      </div>
    </div>
  )
}

function DiagnosticClickDemo() {
  return (
    <div className="relative min-h-[560px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#121210] p-6 shadow-2xl backdrop-blur-3xl">
      <div className="relative z-10 flex items-center justify-between">
        <span className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold">● Diagnostic ON</span>
        <span className="rounded-xl border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-100"><Activity className="mr-2 inline h-4 w-4" />Movement Screen</span>
      </div>
      <video src={diagnosisVideoUrl} className="absolute inset-0 h-full w-full object-cover opacity-10 mix-blend-screen" autoPlay muted loop playsInline />
      <div className="absolute inset-0 bg-[#121210]/70" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:48px_48px] [transform:perspective(700px)_rotateX(62deg)] [transform-origin:bottom]" />
      <div className="absolute left-[18%] top-[18%] h-[390px] w-[230px]"><AnatomyFigure className="h-full w-full opacity-75" /></div>
      <MousePointer2 className="landing-cursor absolute left-[49%] top-[32%] h-8 w-8 text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.85)]" />
      <span className="landing-pain-dot absolute left-[50%] top-[39%] h-6 w-6 rounded-full border-4 border-orange-200 bg-orange-500 shadow-[0_0_38px_rgba(251,146,60,0.9)]" />
      <div className="absolute left-[52%] top-[40%] h-0.5 w-48 bg-orange-400 shadow-[0_0_18px_rgba(251,146,60,0.9)]" />
      <div className="absolute right-8 top-[30%] space-y-4">
        {contributors.map((item, index) => (
          <div key={item.name} className="landing-contributor-card w-72 rounded-xl border border-orange-400/40 bg-black/55 p-4 shadow-xl backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-200/60 hover:shadow-[0_0_35px_rgba(34,211,238,0.2)]" style={{ animationDelay: `${1.5 + index * 0.25}s` }}>
            <div className="flex items-center justify-between text-lg font-semibold"><span>{item.name}</span><span className="text-orange-200">{item.value}</span></div>
            <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">● {item.label}</p>
          </div>
        ))}
      </div>
      <div className="landing-bicep-isolate absolute bottom-6 right-8 w-80 rounded-2xl border border-cyan-200/25 bg-cyan-200/10 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between"><span className="font-semibold">Biceps Brachii isolated</span><button className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-semibold text-slate-950">Isolate</button></div>
        <div className="mt-4 h-24 rounded-xl bg-[radial-gradient(circle_at_60%_25%,rgba(34,211,238,0.55),transparent_18%),radial-gradient(circle_at_42%_52%,rgba(248,113,113,0.55),transparent_23%),rgba(2,6,23,0.75)] ring-1 ring-white/10" />
      </div>
    </div>
  )
}

function CoachDemo() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-3xl">
      <div className="grid overflow-hidden rounded-[1.4rem] border border-white/10 lg:grid-cols-2">
        <div className="relative min-h-[360px] bg-slate-950">
          <video src={aiCoachVideoUrl} className="h-full min-h-[360px] w-full object-cover opacity-70" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/20" />
          <span className="absolute left-4 top-4 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">Reference</span>
          <span className="absolute bottom-4 left-4 text-sm font-semibold">Standing chest stretch</span>
        </div>
        <div className="relative min-h-[360px] overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.16),transparent_36%),#030712]">
          <span className="absolute left-4 top-4 rounded-md bg-cyan-300/15 px-3 py-1 text-xs font-semibold text-cyan-100 backdrop-blur">Camera feed · anonymized</span>
          <StylizedSkeleton />
          <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-sm"><span>Current ROM</span><span className="font-mono text-cyan-200">115° / Target 180°</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="landing-rom h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" /></div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <Metric label="Form score" value="92" />
        <Metric label="Shoulder relaxed" value="Good" />
        <Metric label="Rep history" value="2 / 10" />
      </div>
    </div>
  )
}

function StylizedSkeleton() {
  return (
    <svg viewBox="0 0 360 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <g className="landing-skeleton" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="168" cy="70" r="22" fill="rgba(15,23,42,0.7)" stroke="rgba(125,211,252,0.8)" strokeWidth="3" />
        <path d="M168 95 L176 165 L168 250" stroke="#fb923c" strokeWidth="8" />
        <path d="M176 115 L92 118 L45 108" stroke="#93f6ff" strokeWidth="7" />
        <path d="M176 116 L260 108 L312 70" stroke="#f472b6" strokeWidth="7" />
        <path d="M173 250 L132 318" stroke="#fb923c" strokeWidth="7" />
        <path d="M171 250 L217 318" stroke="#fb923c" strokeWidth="7" />
        {[168, 176, 92, 45, 260, 312, 132, 217].map((x, i) => (
          <circle key={`${x}-${i}`} cx={x} cy={[70,115,118,108,108,70,318,318][i]} r="7" fill={i > 3 ? '#f472b6' : '#67e8f9'} stroke="#020617" strokeWidth="2" />
        ))}
      </g>
    </svg>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"><p className="text-xs uppercase tracking-widest text-cyan-200/80">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>
}
