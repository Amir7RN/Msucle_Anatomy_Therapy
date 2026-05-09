import { Activity, ArrowRight, Bot, ChevronRight, Sparkles, Zap } from 'lucide-react'

type MoveMateHomeProps = {
  atlasUrl: string
  diagnosticUrl: string
}

const diagnosisVideoUrl = new URL('../Videos/Shoulder-Deltoid/Diagnosis.mp4', import.meta.url).href
const aiCoachVideoUrl = new URL('../Videos/Shoulder-Deltoid/AICouch.mp4', import.meta.url).href

const triageMessages = [
  ['You', 'I have a pain on my shoulder'],
  ['MoveMate', 'Is it the front, back, or top of your shoulder?'],
  ['You', 'Right side and the front'],
  ['MoveMate', 'Likely source identified: Deltoid.'],
]

export function MoveMateHome({ atlasUrl, diagnosticUrl }: MoveMateHomeProps) {
  return (
    <main className="h-full min-h-screen overflow-y-auto bg-[#05070d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:80px_80px]" />
      <div className="pointer-events-none fixed left-1/2 top-[-14rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-cyan-400/15 blur-[130px]" />
      <div className="pointer-events-none fixed bottom-[-10rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-orange-400/10 blur-[120px]" />

      <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#05070d]/75 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300/10 ring-1 ring-cyan-300/30">
              <Zap className="h-5 w-5 text-cyan-200" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">MoveMate AI</span>
              <span className="block text-xs text-slate-400">Body insight + form coaching</span>
            </span>
          </a>
          <a href={diagnosticUrl} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20">
            Open App
          </a>
        </div>
      </nav>

      <section id="top" className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-24 pt-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:pt-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-300 backdrop-blur-2xl">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            Official MoveMate feature showcase
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] sm:text-7xl lg:text-8xl">
            Find what hurts. Move better. Stay in flow.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Meet MoveMate AI—a calm body companion that turns your notes, taps, and reps into clear muscle insights and form feedback.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a href={diagnosticUrl} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-full bg-cyan-200 px-7 py-4 font-semibold text-slate-950 transition hover:bg-white">
              Start Diagnostic <ArrowRight className="h-4 w-4" />
            </a>
            <a href={atlasUrl} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 font-semibold backdrop-blur-xl transition hover:border-orange-300/60 hover:bg-orange-300/10">
              Explore Anatomy <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
        <MissionPreview />
      </section>

      <Showcase id="triage" eyebrow="Panel 1 · AI Triage" title="A real conversation flow that identifies the next best focus." description="Messages appear in sequence, then MoveMate highlights the leading source.">
        <TriagePanel />
      </Showcase>

      <Showcase id="diagnosis" eyebrow="Panel 2 · Precision Diagnosis" title="Tap the body to see likely contributors snap into focus." description="This is only the provided Diagnosis video—no extra cursor or duplicate overlay added by the landing page." reverse>
        <VideoPanel src={diagnosisVideoUrl} label="Diagnosis video" />
      </Showcase>

      <Showcase id="coach" eyebrow="Panel 3 · AI Coach" title="Reference, camera, cue, repeat." description="This is only the provided AI Coach video—no duplicate skeleton or cue overlay added by the landing page.">
        <VideoPanel src={aiCoachVideoUrl} label="AI Coach video" />
      </Showcase>

      <section id="mission" className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid items-center gap-10 rounded-[2rem] border border-white/12 bg-white/[0.055] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
          <MissionPreview />
          <div className="px-2 py-6 lg:px-6">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200/80">Panel 4 · The Core Mission</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Find what hurts. Move better. Stay in flow.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">The story is simple: start with what you feel, inspect the likely source, then practice with live feedback.</p>
          </div>
        </div>
      </section>
    </main>
  )
}

function Showcase({ id, eyebrow, title, description, reverse = false, children }: { id: string; eyebrow: string; title: string; description: string; reverse?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className="relative z-10 mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
      <div className={`grid items-center gap-10 ${reverse ? 'lg:grid-cols-[1.15fr_0.85fr]' : 'lg:grid-cols-[0.85fr_1.15fr]'}`}>
        <div className={reverse ? 'lg:order-2' : ''}>
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-orange-200/80">{eyebrow}</p>
          <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">{title}</h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">{description}</p>
        </div>
        <div className={reverse ? 'lg:order-1' : ''}>{children}</div>
      </div>
    </section>
  )
}

function TriagePanel() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="grid min-h-[520px] overflow-hidden rounded-[1.35rem] border border-white/12 bg-[#080d1d] md:grid-cols-[420px_1fr]">
        <div className="border-r border-white/10 bg-[#0c1225]/96 p-5">
          <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
            <span className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-orange-300" /> AI Diagnosis</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">Voice OFF</span>
          </div>
          <div className="space-y-4">
            {triageMessages.map(([speaker, text], index) => (
              <div key={text} className={`flex ${speaker === 'You' ? 'justify-end' : 'justify-start'}`}>
                <span className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-5 shadow-xl ${speaker === 'You' ? 'bg-orange-500 text-white' : 'bg-slate-700/90 text-slate-100'}`} style={{ opacity: 1, transitionDelay: `${index * 160}ms` }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative hidden md:block">
          <video src={diagnosisVideoUrl} className="h-full w-full object-cover opacity-40 blur-[1px]" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-slate-950/58" />
          <div className="absolute left-[16%] top-[38%] rounded-2xl border border-orange-300/50 bg-black/65 p-5 shadow-[0_0_42px_rgba(251,146,60,0.34)] backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.28em] text-orange-200/80">Leading source</p>
            <div className="mt-2 flex items-center gap-6 text-xl font-semibold"><span>Deltoid</span><span className="text-orange-200">Primary</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function VideoPanel({ src, label }: { src: string; label: string }) {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="relative aspect-[16/10] min-h-[520px] overflow-hidden rounded-[1.35rem] border border-white/12 bg-black">
        <video src={src} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
        <div className="absolute left-4 top-4 rounded-md bg-black/50 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">{label}</div>
      </div>
    </div>
  )
}

function MissionPreview() {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-[1.5rem] border border-white/12 bg-black shadow-[0_28px_110px_rgba(0,0,0,0.48)]">
      <div className="grid h-full grid-cols-2">
        <div className="relative overflow-hidden border-r border-white/10">
          <video src={diagnosisVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
        </div>
        <div className="relative overflow-hidden">
          <video src={aiCoachVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070d]/78 via-transparent to-[#05070d]/12" />
      <div className="absolute left-5 top-5 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-100 backdrop-blur-xl">MoveMate AI</div>
      <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/12 bg-slate-950/68 p-5 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-200/80">Live movement loop</p>
        <p className="mt-2 text-xl font-semibold">Find the source, then coach the next rep.</p>
      </div>
    </div>
  )
}
