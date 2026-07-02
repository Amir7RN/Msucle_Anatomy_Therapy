/**
 * MoveMateLanding.tsx — the MoveMate platform landing experience.
 *
 * Design goals
 * ────────────
 *  • REAL product, not mockups: the hero and platform sections use actual
 *    captured footage of the digital twin + live-coach sessions and REAL
 *    headless-browser screenshots of the running app (public/landing/*.png),
 *    dressed with the same telemetry chrome the app renders live.
 *  • Two platforms, one story: MoveMate Relief (find what hurts) and
 *    MoveMate Train (train what matters) each get a full showcase, plus deep
 *    sections for the Digital Twin, Remote Assessment, and the AI Program.
 *  • Everything animates on scroll (framer-motion shim) and loops subtle CSS
 *    animations so every panel feels alive without any JS timers.
 */

import type React from 'react'
import {
  Activity, ArrowRight, Bot, ChevronRight, CircleDot, Dumbbell, FileText,
  Flame, HeartPulse, Lock, MousePointer2, Radio, Scan, ShieldCheck, Sparkles,
  Video, Zap,
} from 'lucide-react'
import { motion } from 'framer-motion'

type LandingPageProps = {
  atlasUrl: string
  diagnosticUrl: string
  gymUrl: string
}

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.22 },
}

const diagnosisVideoUrl = new URL('../../../Videos/Shoulder-Deltoid/Diagnosis.mp4', import.meta.url).href
const aiCoachVideoUrl = new URL('../../../Videos/Shoulder-Deltoid/AICouch.mp4', import.meta.url).href
const trainShotUrl = `${import.meta.env.BASE_URL}landing/train-home.png`

const triageMessages = [
  { role: 'user', text: 'I have a pain on my shoulder' },
  { role: 'ai', text: 'Is it the front, back, or top of your shoulder?' },
  { role: 'user', text: 'Right side and the front' },
  { role: 'ai', text: 'Does the pain stay near the shoulder or travel down the arm?' },
  { role: 'user', text: 'It stays there. A couple days.' },
  { role: 'ai', text: 'Likely source identified: Deltoid.' },
]

const STATS: Array<[string, string]> = [
  ['33', 'landmarks tracked live'],
  ['600+', 'muscles & structures in 3D'],
  ['6', 'movement screens · exact degrees'],
  ['100%', 'pose data stays on your device'],
]

export function MoveMateLanding({ atlasUrl, diagnosticUrl, gymUrl }: LandingPageProps) {
  return (
    <main className="h-full min-h-screen overflow-y-auto bg-[#05070d] text-white selection:bg-cyan-300 selection:text-slate-950">
      <LandingAnimationStyles />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-14rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-cyan-500/16 blur-[130px]" />
        <div className="absolute bottom-0 right-[-12rem] h-[34rem] w-[34rem] rounded-full bg-orange-500/12 blur-[120px]" />
        <div className="absolute left-[-10rem] top-1/2 h-[28rem] w-[28rem] rounded-full bg-violet-500/8 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[length:80px_80px]" />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
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
          <div className="hidden items-center gap-6 text-sm text-slate-300 lg:flex">
            <a className="transition hover:text-white" href="#platforms">Platforms</a>
            <a className="transition hover:text-white" href="#twin">Digital Twin</a>
            <a className="transition hover:text-white" href="#train">Train</a>
            <a className="transition hover:text-white" href="#remote">Remote</a>
            <a className="transition hover:text-white" href="#program">AI Program</a>
          </div>
          <div className="flex items-center gap-2">
            <a href={gymUrl} className="hidden rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.12)] transition hover:border-amber-300/70 hover:bg-amber-400/20 hover:shadow-[0_0_36px_rgba(251,191,36,0.35)] sm:inline-flex">
              💪 Gym Training
            </a>
            <a href={diagnosticUrl} className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition hover:border-cyan-200/70 hover:bg-cyan-300/20 hover:shadow-[0_0_36px_rgba(34,211,238,0.35)]">
              Open App
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="top" className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-20 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:pt-28">
        <motion.div {...reveal} transition={{ duration: 0.7 }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-300 shadow-2xl backdrop-blur-2xl">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            Your camera becomes a movement lab
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-7xl lg:text-8xl">
            Find what hurts.{' '}
            <span className="bg-gradient-to-r from-cyan-200 via-white to-orange-200 bg-clip-text text-transparent">Move better.</span>{' '}
            Stay in flow.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            MoveMate turns any webcam into a biomechanics engine — a 3D muscle twin that moves as you move,
            joint angles measured to the degree, and an AI coach that speaks like a human trainer.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a href={diagnosticUrl} className="group inline-flex min-w-48 items-center justify-center gap-2 rounded-full bg-cyan-200 px-7 py-4 font-semibold text-slate-950 shadow-[0_0_44px_rgba(103,232,249,0.34)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_0_70px_rgba(103,232,249,0.55)]">
              Start Diagnostic <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
            <a href={atlasUrl} className="group inline-flex min-w-48 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 font-semibold text-white backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-orange-300/60 hover:bg-orange-300/10 hover:shadow-[0_0_50px_rgba(251,146,60,0.28)]">
              Explore Anatomy <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
          </div>
          <div className="mt-6">
            <a href={gymUrl}
              className="group inline-flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-orange-500/10 px-6 py-3.5 text-left backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-amber-300/60 hover:shadow-[0_0_50px_rgba(251,146,60,0.32)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-amber-500/30">💪</span>
              <span>
                <span className="block text-sm font-bold text-amber-100">New — MoveMate Train · Gym</span>
                <span className="block text-xs text-amber-200/70">Train by muscle group · live reps, muscle activation & Apple Watch</span>
              </span>
              <ArrowRight className="ml-1 h-4 w-4 text-amber-200 transition group-hover:translate-x-1" />
            </a>
          </div>
        </motion.div>
        <motion.div {...reveal} transition={{ duration: 0.75, delay: 0.1 }}>
          <MissionVisual compact />
        </motion.div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-7xl px-5 pb-8 sm:px-8">
        <motion.div {...reveal} transition={{ duration: 0.6 }} className="grid grid-cols-2 gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-2xl sm:grid-cols-4 sm:gap-6 sm:p-6">
          {STATS.map(([value, label]) => (
            <div key={label} className="text-center">
              <div className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">{value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-400 sm:text-xs">{label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Two platforms (REAL screenshots) ────────────────────────────── */}
      <section id="platforms" className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
        <motion.div {...reveal} className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200/80">One body · two platforms</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Relief when it hurts. Train when it doesn't.</h2>
        </motion.div>
        <div className="grid gap-6 lg:grid-cols-2">
          <PlatformCard
            href={diagnosticUrl}
            video={diagnosisVideoUrl}
            eyebrow="MoveMate Relief"
            tone="cyan"
            title="Diagnose, isolate, and rebuild"
            points={['AI triage that talks like a clinician', 'Tap the 3D body — likely sources ranked', 'Movement screens with exact joint deviations']}
          />
          <PlatformCard
            href={gymUrl}
            shot={trainShotUrl}
            eyebrow="MoveMate Train"
            tone="amber"
            title="Pick a muscle. The camera does the rest."
            points={['Train by muscle group on a live 3D model', 'Reps, depth & activation counted on-device', 'AI detects the weight in your hands']}
          />
        </div>
      </section>

      {/* ── Relief showcase panels ──────────────────────────────────────── */}
      <ShowcasePanel
        id="triage"
        eyebrow="Relief · AI Triage"
        title="A real conversation flow that identifies the next best focus."
        description="Messages appear one by one, the background softens, and the leading source highlights only after the conversation has enough context."
      >
        <TriagePanel />
      </ShowcasePanel>

      <ShowcasePanel
        id="diagnosis"
        eyebrow="Relief · Precision Diagnosis"
        title="Tap the body to see likely contributors snap into focus."
        description="Real capture of the diagnostic session: pain point, blueprint timing, ranked contributors, and an isolate state."
        reverse
      >
        <DiagnosisPanel />
      </ShowcasePanel>

      {/* ── Digital Twin ─────────────────────────────────────────────────── */}
      <ShowcasePanel
        id="twin"
        eyebrow="The Digital Twin"
        title="A 3D you, anchored to the floor, colored by effort."
        description="MediaPipe pose drives a segment-rigged muscular model in real time. It stands when you stand, jumps when you jump, lies down when you do — and every muscle warms from tan to deep red as it works, scaled by the actual weight the camera sees in your hands."
      >
        <TwinPanel />
      </ShowcasePanel>

      {/* ── MoveMate Train ──────────────────────────────────────────────── */}
      <section id="train" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <motion.div {...reveal} transition={{ duration: 0.65 }}>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-amber-200/80">MoveMate Train</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Your gym dashboard, rendered from your reps.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Pick a muscle group on the 3D model. The camera counts reps, plots depth per rep,
              estimates activation, and the twin's muscles glow exactly where you're working.
              Heart rate streams in from Apple Watch or any Bluetooth strap.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                ['🎯', 'Rep counting + range-of-motion radar, fully on-device'],
                ['🔥', 'Muscle-fatigue tracking across the session'],
                ['🏋️', 'AI vision reads the dumbbell in your hand — activation scales with real load'],
                ['⌚', 'Live BPM from Apple Health export or Bluetooth heart-rate'],
              ].map(([emoji, text]) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="text-base">{emoji}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <a href={gymUrl} className="group mt-8 inline-flex items-center gap-2 rounded-full bg-amber-300 px-7 py-4 font-semibold text-slate-950 shadow-[0_0_44px_rgba(251,191,36,0.3)] transition hover:-translate-y-0.5 hover:bg-amber-200 hover:shadow-[0_0_70px_rgba(251,191,36,0.5)]">
              Open MoveMate Train <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
          </motion.div>

          <motion.div {...reveal} transition={{ duration: 0.7, delay: 0.08 }}>
            <BrowserFrame label="movemate.app/?gym=1" tone="amber">
              <div className="relative">
                <img src={trainShotUrl} alt="MoveMate Train — pick a muscle group on the live 3D model" className="block w-full" loading="lazy" />
                {/* Live telemetry chips layered over the real screenshot */}
                <div className="landing-cue absolute bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-slate-950/80 px-4 py-3 backdrop-blur-xl">
                  <RepRingDemo />
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/80">Live set</div>
                    <div className="text-sm font-semibold">Reps counted by camera</div>
                  </div>
                </div>
                <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 backdrop-blur">
                  <HeartPulse className="landing-heart h-3.5 w-3.5" /> 128 bpm
                </div>
                <div className="absolute bottom-4 right-4 w-40 rounded-xl border border-white/10 bg-slate-950/80 p-3 backdrop-blur-xl">
                  <div className="text-[9px] uppercase tracking-widest text-slate-400">Activation</div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="landing-activation-sweep h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
                  </div>
                </div>
              </div>
            </BrowserFrame>
          </motion.div>
        </div>
      </section>

      {/* ── Remote Assessment ───────────────────────────────────────────── */}
      <section id="remote" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div {...reveal} transition={{ duration: 0.7 }} className="lg:order-1 order-2">
            <RemotePanel />
          </motion.div>
          <motion.div {...reveal} transition={{ duration: 0.65 }} className="lg:order-2 order-1">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200/80">Remote Assessment</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Assess anyone, anywhere — every joint, live.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Send one link. They open it on a phone — nothing to install. You see their camera with a
              pose skeleton burned in and a live readout of <b>every primary joint</b>: shoulders, elbows,
              hips, knees, ankles — left and right, in degrees. Record a walk, capture postures, export
              a PDF report with the screenshots inside.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              {[
                [<Video key="v" className="h-4 w-4 text-cyan-300" />, 'Peer-to-peer video with two-way voice guidance'],
                [<Radio key="r" className="h-4 w-4 text-cyan-300" />, 'Full-body joint telemetry at ~8 Hz on the evaluator side'],
                [<FileText key="f" className="h-4 w-4 text-cyan-300" />, 'One-click PDF / PNG / CSV assessment reports'],
              ].map(([icon, text], i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5">{icon}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ── AI Program & Analysis ───────────────────────────────────────── */}
      <section id="program" className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <motion.div {...reveal} transition={{ duration: 0.65 }}>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-orange-200/80">Assessment → Analysis → Program</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Deficits in degrees. Fixes on a schedule.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Six standardized movements, measured against clinical reference ranges. The engine reports
              exactly how many degrees each joint is short of normal, then injects severity-dosed exercise
              sequences straight into your training queue — a personalized program that regenerates from
              every fresh assessment.
            </p>
          </motion.div>
          <motion.div {...reveal} transition={{ duration: 0.7, delay: 0.08 }}>
            <AnalysisPanel />
          </motion.div>
        </div>
      </section>

      {/* ── Coach panel (existing footage) ──────────────────────────────── */}
      <ShowcasePanel
        id="coach"
        eyebrow="AI Coach"
        title="Reference, camera, cue, repeat."
        description="The coach tracks the trend of your form over the last 20 seconds — not just the frame — and speaks when a human coach would: sooner when form slips, less when you're in a groove."
      >
        <CoachPanel />
      </ShowcasePanel>

      {/* ── Capability marquee ──────────────────────────────────────────── */}
      <section className="relative border-y border-white/10 bg-white/[0.03] py-6 backdrop-blur">
        <div className="landing-marquee flex w-max items-center gap-4">
          {[...CAPABILITIES, ...CAPABILITIES].map((c, i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-slate-300">
              {c.icon} {c.text}
            </span>
          ))}
        </div>
      </section>

      {/* ── Mission / closing CTA ───────────────────────────────────────── */}
      <section id="mission" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <motion.div {...reveal} transition={{ duration: 0.7 }} className="grid items-center gap-10 rounded-[2rem] border border-white/12 bg-white/[0.055] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
          <MissionVisual />
          <div className="px-2 py-6 lg:px-6">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-200/80">The Core Mission</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Find what hurts. Move better. Stay in flow.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">Meet MoveMate AI—a calm body companion that turns your notes, taps, and reps into clear muscle insights and form feedback.</p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a href={diagnosticUrl} className="rounded-full bg-cyan-200 px-7 py-4 text-center font-semibold text-slate-950 transition hover:bg-white hover:shadow-[0_0_60px_rgba(103,232,249,0.45)]">Start Diagnostic</a>
              <a href={gymUrl} className="rounded-full border border-amber-300/40 bg-amber-400/10 px-7 py-4 text-center font-semibold text-amber-100 transition hover:border-amber-200/70 hover:bg-amber-400/20 hover:shadow-[0_0_44px_rgba(251,191,36,0.3)]">Open Train</a>
              <a href={atlasUrl} className="rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 text-center font-semibold transition hover:border-orange-300/60 hover:bg-orange-300/10 hover:shadow-[0_0_44px_rgba(251,146,60,0.22)]">Explore Anatomy</a>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-black/40 py-10 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-sm text-slate-500 sm:flex-row sm:px-8">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-300" /> MoveMate AI
          </span>
          <span className="flex items-center gap-2 text-[12px]">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Camera frames never leave your device — pose runs in your browser.
          </span>
          <span className="text-[12px]">Education & biofeedback · not a medical device</span>
        </div>
      </footer>
    </main>
  )
}

const CAPABILITIES: Array<{ icon: React.ReactNode; text: string }> = [
  { icon: <Flame className="h-4 w-4 text-orange-300" />, text: 'Live muscle heatmap' },
  { icon: <Activity className="h-4 w-4 text-cyan-300" />, text: 'ROM measured in degrees' },
  { icon: <Dumbbell className="h-4 w-4 text-amber-300" />, text: 'AI weight detection' },
  { icon: <Scan className="h-4 w-4 text-sky-300" />, text: 'Left/right symmetry report' },
  { icon: <Video className="h-4 w-4 text-violet-300" />, text: 'Remote assessment calls' },
  { icon: <HeartPulse className="h-4 w-4 text-rose-300" />, text: 'Apple Watch heart rate' },
  { icon: <Sparkles className="h-4 w-4 text-cyan-200" />, text: 'Personalized 4-week program' },
  { icon: <FileText className="h-4 w-4 text-slate-300" />, text: 'PDF / CSV clinical exports' },
  { icon: <Lock className="h-4 w-4 text-emerald-300" />, text: 'On-device by design' },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Building blocks
// ─────────────────────────────────────────────────────────────────────────────

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

/** Browser-chrome frame around a real screenshot. */
function BrowserFrame({ label, tone, children }: { label: string; tone: 'cyan' | 'amber'; children: React.ReactNode }) {
  const glow = tone === 'amber' ? 'shadow-[0_30px_120px_rgba(251,146,60,0.14)]' : 'shadow-[0_30px_120px_rgba(34,211,238,0.14)]'
  return (
    <div className={`overflow-hidden rounded-[1.4rem] border border-white/12 bg-slate-950/80 backdrop-blur-2xl ${glow}`}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="mx-auto rounded-md bg-white/[0.06] px-3 py-0.5 font-mono text-[11px] text-slate-400">{label}</span>
      </div>
      {children}
    </div>
  )
}

function PlatformCard({ href, shot, video, eyebrow, title, points, tone }: {
  href: string; shot?: string; video?: string; eyebrow: string; title: string; points: string[]; tone: 'cyan' | 'amber'
}) {
  const accent = tone === 'amber'
    ? { text: 'text-amber-200/90', border: 'hover:border-amber-300/50', glow: 'hover:shadow-[0_0_70px_rgba(251,191,36,0.16)]', dot: 'text-amber-300' }
    : { text: 'text-cyan-200/90', border: 'hover:border-cyan-300/50', glow: 'hover:shadow-[0_0_70px_rgba(34,211,238,0.16)]', dot: 'text-cyan-300' }
  return (
    <a href={href} className="block">
    <motion.div
      {...reveal}
      transition={{ duration: 0.65 }}
      className={`group overflow-hidden rounded-[1.6rem] border border-white/12 bg-white/[0.045] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 ${accent.border} ${accent.glow}`}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {video ? (
          <video src={video} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" autoPlay muted loop playsInline />
        ) : (
          <img src={shot} alt={`${eyebrow} — real product screenshot`} loading="lazy"
            className="h-full w-full object-cover object-left-top transition-transform duration-500 group-hover:scale-[1.03]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#05070d] via-transparent to-transparent" />
        <span className={`absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold backdrop-blur ${accent.text}`}>
          {eyebrow} · real app capture
        </span>
      </div>
      <div className="p-6">
        <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <CircleDot className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accent.dot}`} /> {p}
            </li>
          ))}
        </ul>
        <span className={`mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${accent.text}`}>
          Enter <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </span>
      </div>
    </motion.div>
    </a>
  )
}

// ── Relief panels (real footage) ─────────────────────────────────────────────

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
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/15" />
        <div className="absolute left-5 top-5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold shadow-xl">● Diagnostic ON</div>
        <MousePointer2 className="landing-cursor absolute left-[52%] top-[34%] h-9 w-9 text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.9)]" />
        <span className="landing-pain-dot absolute left-[51.8%] top-[40%] h-6 w-6 rounded-full border-4 border-orange-200 bg-orange-500 shadow-[0_0_38px_rgba(251,146,60,0.95)]" />
        <div className="landing-blueprint absolute right-[6%] top-[34%] hidden w-[34%] space-y-4 md:block">
          {['Primary Contributor', 'Secondary Contributor', 'Supporting Contributor'].map((label, index) => (
            <div key={label} className="rounded-xl border border-orange-400/60 bg-black/72 p-4 shadow-[0_0_30px_rgba(251,146,60,0.20)] backdrop-blur-xl">
              <div className="flex items-center justify-between text-lg font-semibold"><span>{label}</span><span className="text-orange-200">{[85, 12, 3][index]}%</span></div>
              <p className="mt-2 text-xs uppercase tracking-widest text-slate-400"><CircleDot className="mr-1 inline h-3 w-3 text-orange-400" /> Ranked by tap location</p>
            </div>
          ))}
        </div>
        <div className="landing-isolate-state absolute bottom-5 left-5 right-5 rounded-2xl border border-cyan-200/30 bg-slate-950/76 p-4 shadow-[0_0_34px_rgba(34,211,238,0.16)] backdrop-blur-xl md:left-auto md:w-[360px]">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Isolate state</p>
          <div className="mt-2 flex items-center justify-between"><span className="font-semibold">Primary Contributor</span><span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-semibold text-slate-950">Focused</span></div>
        </div>
      </div>
    </div>
  )
}

// ── Digital Twin panel ───────────────────────────────────────────────────────

function TwinPanel() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="relative aspect-[16/10] min-h-[520px] overflow-hidden rounded-[1.35rem] border border-white/12 bg-black">
        <video src={diagnosisVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/20" />

        {/* State machine chips — swap on a loop like the live rig does */}
        <div className="absolute left-5 top-5 flex gap-2">
          <span className="landing-state-a rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/40 backdrop-blur">⬇ Grounded</span>
          <span className="landing-state-b rounded-full bg-orange-500/20 px-3 py-1.5 text-xs font-semibold text-orange-300 ring-1 ring-orange-500/40 backdrop-blur">↑ Airborne</span>
        </div>
        <div className="absolute right-5 top-5 hidden items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur sm:flex">
          <span>Activation</span>
          <span className="h-1.5 w-20 rounded-full" style={{ background: 'linear-gradient(90deg,#6b5b4a,#f59e0b,#b91c1c)' }} />
          <span className="text-slate-400">rest → max</span>
        </div>

        {/* Load chip — the vision model reading the weight */}
        <div className="landing-cue absolute bottom-5 left-5 rounded-2xl border border-white/12 bg-slate-950/80 p-4 backdrop-blur-xl">
          <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-200/80">AI load detection</p>
          <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
            <Dumbbell className="h-4 w-4 text-amber-300" /> 10 kg dumbbell · right hand
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Torque scales with the real moment arm</p>
        </div>
        <div className="absolute bottom-5 right-5 w-44 rounded-2xl border border-white/12 bg-slate-950/80 p-3.5 backdrop-blur-xl">
          <div className="text-[9px] uppercase tracking-widest text-slate-400">Biceps brachii</div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="landing-activation-sweep h-full rounded-full bg-gradient-to-r from-amber-500 to-red-600" />
          </div>
          <div className="mt-2 text-[9px] uppercase tracking-widest text-slate-400">Deltoid</div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="landing-activation-sweep-slow h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Remote assessment panel ──────────────────────────────────────────────────

const REMOTE_JOINTS: Array<[string, number, number]> = [
  ['Shoulder elev.', 42, 44],
  ['Elbow flex.', 12, 15],
  ['Hip flex.', 8, 9],
  ['Knee flex.', 6, 11],
  ['Ankle', 88, 91],
]

function RemotePanel() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="grid overflow-hidden rounded-[1.35rem] border border-white/12 lg:grid-cols-[1.4fr_1fr]">
        {/* Client feed with skeleton burned in */}
        <div className="relative min-h-[420px] bg-black">
          <video src={aiCoachVideoUrl} className="h-full w-full object-cover opacity-80" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/30" />
          <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Connected · client camera
          </span>
          <span className="absolute right-4 top-4 rounded-full bg-red-600/90 px-3 py-1 text-[11px] font-semibold backdrop-blur">
            ● REC 0:24
          </span>
          <div className="landing-cue absolute bottom-4 left-4 right-4 rounded-xl border border-cyan-200/25 bg-slate-950/80 p-3 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-200/80">Voice guidance</p>
            <p className="mt-1 text-sm font-semibold">"Great — now walk toward the line for me."</p>
          </div>
        </div>
        {/* Evaluator dashboard */}
        <div className="border-t border-white/10 bg-[#070b16] p-4 lg:border-l lg:border-t-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Evaluator dashboard</div>
          <div className="mt-3 space-y-1">
            <div className="grid grid-cols-[1fr_2.6rem_2.6rem] gap-1 text-[9px] uppercase tracking-wider text-slate-500">
              <span>Live joints</span><span className="text-right text-orange-300/80">L</span><span className="text-right text-cyan-300/80">R</span>
            </div>
            {REMOTE_JOINTS.map(([label, l, r], i) => (
              <div key={label} className="landing-joint-row grid grid-cols-[1fr_2.6rem_2.6rem] items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1.5 text-[12px]" style={{ animationDelay: `${i * 0.35}s` }}>
                <span className="truncate text-slate-300">{label}</span>
                <span className="text-right font-semibold tabular-nums text-orange-300">{l}°</span>
                <span className="text-right font-semibold tabular-nums text-cyan-300">{r}°</span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-white/[0.04] p-2">
              <div className="text-[9px] uppercase tracking-wider text-slate-500">Steps</div>
              <div className="text-lg font-bold tabular-nums">14</div>
            </div>
            <div className="rounded-lg bg-white/[0.04] p-2">
              <div className="text-[9px] uppercase tracking-wider text-slate-500">Symmetry</div>
              <div className="text-lg font-bold tabular-nums text-emerald-300">94%</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="flex-1 rounded-lg bg-violet-500/90 px-2 py-2 text-center text-[11px] font-semibold">PDF report</span>
            <span className="flex-1 rounded-lg bg-white/[0.08] px-2 py-2 text-center text-[11px] font-semibold text-slate-300">CSV</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Analysis / program panel ─────────────────────────────────────────────────

const DEVIATION_ROWS: Array<[string, string, string, string, 'severe' | 'moderate' | 'mild']> = [
  ['L shoulder flexion', '141°', '150–180°', '−9°', 'mild'],
  ['R knee flexion', '96°', '130–140°', '−34°', 'severe'],
  ['Cervical rotation L', '52°', '60–80°', '−8°', 'moderate'],
  ['R hip flexion', '78°', '100–120°', '−22°', 'moderate'],
]

function AnalysisPanel() {
  const chip = (b: string) =>
    b === 'severe' ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40'
    : b === 'moderate' ? 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40'
    : 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/40'
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Kinematic deviations · measured vs normative</div>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
        <div className="grid grid-cols-[1.4fr_0.7fr_0.9fr_0.6fr_0.8fr] gap-2 bg-white/[0.05] px-3 py-2 text-[9px] uppercase tracking-wider text-slate-500">
          <span>Joint</span><span className="text-right">Measured</span><span className="text-right">Normal</span><span className="text-right">Dev.</span><span>Severity</span>
        </div>
        {DEVIATION_ROWS.map(([joint, meas, norm, dev, band], i) => (
          <div key={joint} className="landing-joint-row grid grid-cols-[1.4fr_0.7fr_0.9fr_0.6fr_0.8fr] items-center gap-2 border-t border-white/5 px-3 py-2 text-[12px]" style={{ animationDelay: `${i * 0.3}s` }}>
            <span className="truncate text-slate-200">{joint}</span>
            <span className="text-right tabular-nums">{meas}</span>
            <span className="text-right tabular-nums text-slate-400">{norm}</span>
            <span className="text-right font-semibold tabular-nums">{dev}</span>
            <span><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${chip(band)}`}>{band}</span></span>
          </div>
        ))}
      </div>
      <div className="landing-cue mt-4 rounded-xl border border-cyan-900/60 bg-cyan-950/25 p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-cyan-100">R knee flexion — 34° below normal</span>
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-300 ring-1 ring-red-500/40">severe</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded bg-white/[0.07] px-2 py-1 text-[10px] text-slate-200">🛋️ Couch Stretch · 3× 45s/side</span>
          <span className="rounded bg-white/[0.07] px-2 py-1 text-[10px] text-slate-200">🧱 Wall Calf Stretch · 3× 30s/side</span>
        </div>
        <p className="mt-2 text-[10px] text-cyan-200/70">→ Injected into your training queue automatically</p>
      </div>
    </div>
  )
}

// ── Coach panel ──────────────────────────────────────────────────────────────

function CoachPanel() {
  return (
    <div className="rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-[0_30px_120px_rgba(0,0,0,0.48)] backdrop-blur-3xl">
      <div className="relative aspect-[16/10] min-h-[520px] overflow-hidden rounded-[1.35rem] border border-white/12 bg-black">
        <video src={aiCoachVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="relative overflow-hidden border-r border-cyan-200/30 bg-slate-950/10 backdrop-blur-[2px]">
            <div className="absolute inset-0 bg-slate-950/28" />
            <StylizedSkeleton />
            <div className="absolute left-4 top-4 rounded-md bg-cyan-300/15 px-3 py-1 text-xs font-semibold text-cyan-100 backdrop-blur">User camera · privacy layer</div>
            <div className="landing-cue absolute bottom-5 left-5 right-5 rounded-2xl border border-cyan-200/35 bg-slate-950/78 p-4 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">Trend-aware cue</p>
              <p className="mt-2 text-2xl font-semibold">"You've gained 8° this hold — keep that direction."</p>
            </div>
          </div>
          <div className="relative bg-gradient-to-l from-black/25 to-transparent">
            <div className="absolute right-4 top-4 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">Reference model</div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-5 right-5 rounded-2xl border border-white/12 bg-black/58 p-4 backdrop-blur-xl">
          <div className="flex items-center gap-3 text-sm font-semibold"><Lock className="h-4 w-4 text-emerald-300" /> Skeleton is the visual focus</div>
          <p className="mt-2 text-xs text-slate-400">Background stays soft while form remains detectable.</p>
        </div>
      </div>
    </div>
  )
}

// ── Hero mission visual ──────────────────────────────────────────────────────

function MissionVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[1.5rem] border border-white/12 bg-black shadow-[0_28px_110px_rgba(0,0,0,0.48)] ${compact ? 'aspect-[16/12]' : 'aspect-[16/10]'}`}>
      <div className="grid h-full grid-cols-2">
        <div className="relative overflow-hidden border-r border-white/10">
          <video src={diagnosisVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/24" />
          <span className="absolute left-4 top-14 rounded-md bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-orange-200 backdrop-blur">
            Digital twin · muscle heatmap
          </span>
        </div>
        <div className="relative overflow-hidden">
          <video src={aiCoachVideoUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/24" />
          <span className="absolute right-4 top-14 rounded-md bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 backdrop-blur">
            Live coach · pose tracked
          </span>
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070d]/78 via-transparent to-[#05070d]/12" />

      <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-100 backdrop-blur-xl">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        MoveMate AI · Live
      </div>
      <div className="absolute right-5 top-5 hidden items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-xl sm:flex">
        <span>Activation</span>
        <span className="h-1.5 w-20 rounded-full" style={{ background: 'linear-gradient(90deg,#6b5b4a,#f59e0b,#b91c1c)' }} />
        <span className="text-slate-400">rest → max</span>
      </div>

      <div className="landing-cue absolute bottom-5 left-5 right-5 rounded-2xl border border-white/12 bg-slate-950/68 p-5 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-200/80">Live movement loop</p>
        <p className="mt-2 text-xl font-semibold">Find the source, then coach the next rep.</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-slate-400">Range of motion</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="landing-rom-fill h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" />
          </div>
          <span className="font-mono text-[11px] text-cyan-200">142° / 180°</span>
        </div>
      </div>
    </div>
  )
}

// ── Tiny animated widgets ────────────────────────────────────────────────────

function RepRingDemo() {
  const R = 16, C = 2 * Math.PI * R
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
      <circle cx="22" cy="22" r={R} fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={C} className="landing-rep-ring" transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fafaf9">7</text>
    </svg>
  )
}

function StylizedSkeleton() {
  return (
    <svg viewBox="0 0 360 360" className="landing-skeleton absolute inset-0 h-full w-full" aria-hidden="true">
      <g strokeLinecap="round" strokeLinejoin="round">
        <circle cx="164" cy="72" r="22" fill="rgba(15,23,42,0.62)" stroke="rgba(125,211,252,0.95)" strokeWidth="3" />
        <path d="M164 98 L176 165 L170 252" stroke="#fb923c" strokeWidth="8" />
        <path d="M174 118 L92 120 L46 112" stroke="#93f6ff" strokeWidth="7" />
        <path d="M176 120 L260 112 L318 74" stroke="#f472b6" strokeWidth="7" />
        <path d="M170 252 L130 320" stroke="#fb923c" strokeWidth="7" />
        <path d="M170 252 L216 320" stroke="#fb923c" strokeWidth="7" />
        {[164, 176, 92, 46, 260, 318, 130, 216].map((x, i) => (
          <circle key={`${x}-${i}`} cx={x} cy={[72,120,120,112,112,74,320,320][i]} r="7" fill={i > 3 ? '#f472b6' : '#67e8f9'} stroke="#020617" strokeWidth="2" />
        ))}
      </g>
    </svg>
  )
}

// ── Keyframes ────────────────────────────────────────────────────────────────

function LandingAnimationStyles() {
  return (
    <style>{`
      @keyframes landing-chat-in {
        0%, 8% { opacity: 0; transform: translateY(14px) scale(0.98); }
        14%, 100% { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes landing-cursor-click {
        0%, 30% { transform: translate(-54px, -34px); opacity: 0; }
        45%, 58% { transform: translate(0, 0); opacity: 1; }
        64%, 100% { transform: translate(0, 0) scale(0.92); opacity: 1; }
      }

      @keyframes landing-pulse-dot {
        0%, 52% { opacity: 0; transform: scale(0.6); }
        64% { opacity: 1; transform: scale(1.2); }
        100% { opacity: 1; transform: scale(1); }
      }

      @keyframes landing-skeleton-rep {
        0%, 100% { transform: translateY(0) rotate(-1deg); }
        50% { transform: translateY(-5px) rotate(2deg); }
      }

      @keyframes landing-source-reveal {
        0%, 72% { opacity: 0; transform: translateY(16px) scale(0.97); filter: blur(4px); }
        84%, 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }

      @keyframes landing-blueprint-snap {
        0%, 58% { opacity: 0; transform: translateX(22px) scale(0.98); filter: blur(5px); }
        70%, 100% { opacity: 1; transform: translateX(0) scale(1); filter: blur(0); }
      }

      @keyframes landing-isolate-reveal {
        0%, 76% { opacity: 0; transform: translateY(16px); }
        88%, 100% { opacity: 1; transform: translateY(0); }
      }

      @keyframes landing-cue-loop {
        0%, 44% { opacity: 0.55; transform: translateY(10px); }
        56%, 100% { opacity: 1; transform: translateY(0); }
      }

      @keyframes landing-rom-sweep {
        0%, 12% { width: 22%; }
        55%, 70% { width: 79%; }
        100% { width: 74%; }
      }

      @keyframes landing-activation {
        0%, 15% { width: 14%; }
        50%, 62% { width: 86%; }
        100% { width: 30%; }
      }

      @keyframes landing-rep-ring-fill {
        0% { stroke-dashoffset: 100.5; }
        70%, 100% { stroke-dashoffset: 30; }
      }

      @keyframes landing-state-swap-a {
        0%, 42% { opacity: 1; }
        50%, 92% { opacity: 0.25; }
        100% { opacity: 1; }
      }
      @keyframes landing-state-swap-b {
        0%, 42% { opacity: 0.25; }
        50%, 92% { opacity: 1; }
        100% { opacity: 0.25; }
      }

      @keyframes landing-joint-tick {
        0%, 100% { background-color: rgba(255,255,255,0.04); }
        50% { background-color: rgba(34,211,238,0.09); }
      }

      @keyframes landing-heartbeat {
        0%, 100% { transform: scale(1); }
        14% { transform: scale(1.25); }
        28% { transform: scale(1); }
        42% { transform: scale(1.18); }
        56% { transform: scale(1); }
      }

      @keyframes landing-marquee-scroll {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }

      .landing-chat-message { opacity: 0; animation: landing-chat-in 7.2s ease-out infinite both; }
      .landing-source-highlight { animation: landing-source-reveal 7.2s ease-out infinite both; }
      .landing-cursor { animation: landing-cursor-click 5.5s ease-in-out infinite both; }
      .landing-pain-dot { animation: landing-pulse-dot 5.5s ease-out infinite both; }
      .landing-skeleton { animation: landing-skeleton-rep 2.6s ease-in-out infinite; transform-origin: center; }
      .landing-blueprint { animation: landing-blueprint-snap 5.5s ease-out infinite both; }
      .landing-isolate-state { animation: landing-isolate-reveal 5.5s ease-out infinite both; }
      .landing-cue { animation: landing-cue-loop 4.2s ease-in-out infinite alternate both; }
      .landing-rom-fill { animation: landing-rom-sweep 4.6s ease-in-out infinite alternate both; }
      .landing-activation-sweep { animation: landing-activation 3.4s ease-in-out infinite both; }
      .landing-activation-sweep-slow { animation: landing-activation 5.1s ease-in-out infinite both; }
      .landing-rep-ring { animation: landing-rep-ring-fill 3.2s ease-out infinite both; }
      .landing-state-a { animation: landing-state-swap-a 6s ease-in-out infinite both; }
      .landing-state-b { animation: landing-state-swap-b 6s ease-in-out infinite both; }
      .landing-joint-row { animation: landing-joint-tick 3.2s ease-in-out infinite both; }
      .landing-heart { animation: landing-heartbeat 1.4s ease-in-out infinite both; }
      .landing-marquee { animation: landing-marquee-scroll 36s linear infinite; }

      @media (prefers-reduced-motion: reduce) {
        [class*='landing-'] { animation: none !important; }
      }
    `}</style>
  )
}
