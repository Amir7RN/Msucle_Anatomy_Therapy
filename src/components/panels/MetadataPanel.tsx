import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { MousePointerClick, MapPin, Zap, StickyNote, Activity, Play, Mic, Square, Volume2, ChevronDown, ChevronRight } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { Badge, systemBadgeColor, layerBadgeColor } from '../ui/Badge'
import { Button } from '../ui/Button'
import { REGION_LABELS, SIDE_LABELS, SYSTEM_LABELS, LAYER_LABELS } from '../../lib/structureMapper'
import { PAIN_PATTERNS } from '../../data/painPatterns'
import {
  groupContributionsForDisplay,
  isGrouped,
  pickSideFromClick,
  type DiagnosticResult,
  type MuscleContribution,
  type GroupedMuscleContribution,
  type DiagnosticDisplayItem,
} from '../../lib/diagnostic'

// ── Exercise video data ───────────────────────────────────────────────────────

interface ExerciseDef {
  id:       string
  label:    string
  subtitle: string
  src:      string
}

// Use BASE_URL so paths work both in local dev (/) and GitHub Pages (/Msucle_Anatomy_Therapy/)
const V = (file: string) => `${import.meta.env.BASE_URL}videos/${file}`

// ── Deltoid exercises split by sub-head ──────────────────────────────────────
// Task 2: Anterior head — front of shoulder, shoulder flexion pattern.
const DELTOID_ANTERIOR_EXERCISES: ExerciseDef[] = [
  { id: 'crab_press',         label: 'Crab Press',              subtitle: 'Anterior delt activation',   src: V('Crab_Press.mp4')               },
  { id: 'doorway_stretch',    label: 'Doorway Stretch',         subtitle: 'Anterior deltoid release',   src: V('DoorWay_Stretch.mp4')          },
  { id: 'hand_behind_back',   label: 'Behind Back Stretch',     subtitle: 'Internal rotation mob.',     src: V('Hand_Behind_Back_Stretch.mp4') },
  { id: 'standing_chest',     label: 'Standing Chest Stretch',  subtitle: 'Pec & anterior delt',        src: V('Standing_Chest_Stretch.mp4')   },
]

// Task 2: Lateral head — outer shoulder, shoulder abduction pattern.
const DELTOID_LATERAL_EXERCISES: ExerciseDef[] = [
  { id: 'seated_cross_arm',   label: 'Seated Cross-Arm Stretch', subtitle: 'Lateral deltoid stretch',  src: V('Seated_Cross_Arm_Stretch.mp4') },
  { id: 'standing_sleeper',   label: 'Sleeper Stretch',          subtitle: 'Posterior capsule mob.',   src: V('Standing_Sleeper_Stretch.mp4') },
]

// Generic fallback when the deltoid is selected without diagnostic sub-context.
const DELTOID_ALL_EXERCISES: ExerciseDef[] = [
  ...DELTOID_ANTERIOR_EXERCISES,
  ...DELTOID_LATERAL_EXERCISES,
]

const EXERCISE_MAP: Record<string, ExerciseDef[]> = {
  // Real mesh IDs — show all exercises when selected directly
  MUSC_DELTOID_R: DELTOID_ALL_EXERCISES,
  MUSC_DELTOID_L: DELTOID_ALL_EXERCISES,
  // Diagnostic sub-muscle IDs — show targeted exercises
  deltoid_anterior:  DELTOID_ANTERIOR_EXERCISES,
  deltoid_lateral:   DELTOID_LATERAL_EXERCISES,
  deltoid_posterior: DELTOID_LATERAL_EXERCISES,  // posterior ≈ lateral rehab pattern
  MUSC_BICEPS_FEMORIS_R: [
    { id: 'hamstring_squeeze', label: 'Hamstring Squeeze',   subtitle: 'Isometric activation',   src: V('Hamstring_Squeeze.mp4')    },
    { id: 'glute_bridge',     label: 'Glute Bridge',        subtitle: 'Hip extension & loading', src: V('Glute_Bridge_Exercise.mp4') },
    { id: 'hip_hinge',        label: 'Hip Hinge',           subtitle: 'Eccentric hamstring',     src: V('Hip_Hinge_Exercise.mp4')   },
  ],
  MUSC_BICEPS_FEMORIS_L: [
    { id: 'hamstring_squeeze', label: 'Hamstring Squeeze',   subtitle: 'Isometric activation',   src: V('Hamstring_Squeeze.mp4')    },
    { id: 'glute_bridge',     label: 'Glute Bridge',        subtitle: 'Hip extension & loading', src: V('Glute_Bridge_Exercise.mp4') },
    { id: 'hip_hinge',        label: 'Hip Hinge',           subtitle: 'Eccentric hamstring',     src: V('Hip_Hinge_Exercise.mp4')   },
  ],
}

// ── Individual video thumbnail card ──────────────────────────────────────────
// The <video> element IS the thumbnail and the player.
// preload="auto" loads the first frame so it's visible immediately.
// Clicking anywhere on the card toggles play / pause.
// When another card becomes active this card auto-pauses via useEffect.

function VideoCard({
  ex,
  isActive,
  onSelect,
}: {
  ex:       ExerciseDef
  isActive: boolean
  onSelect: () => void
}) {
  const videoRef            = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  // Auto-pause when a sibling card is selected
  useEffect(() => {
    if (!isActive) {
      videoRef.current?.pause()
      setPlaying(false)
    }
  }, [isActive])

  // Seek to first frame so the video shows a real thumbnail before any click
  function handleLoaded() {
    const v = videoRef.current
    if (v && v.currentTime === 0) v.currentTime = 0.05
  }

  function handleClick() {
    onSelect()                          // mark this card active (pauses siblings)
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play();  setPlaying(true)  }
    else          { v.pause(); setPlaying(false) }
  }

  return (
    <div
      onClick={handleClick}
      className={[
        'relative cursor-pointer rounded-lg overflow-hidden border transition-colors group',
        isActive
          ? 'border-emerald-500 dark:border-emerald-500'
          : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400/60 dark:hover:border-emerald-600/60',
      ].join(' ')}
    >
      {/* Video — doubles as thumbnail (first frame) and inline player */}
      <video
        ref={videoRef}
        src={ex.src}
        preload="auto"
        playsInline
        className="w-full block bg-black"
        onLoadedData={handleLoaded}
        onEnded={() => setPlaying(false)}
      />

      {/* Play-icon overlay — fades out while playing */}
      <div
        className={[
          'absolute inset-0 flex items-center justify-center transition-opacity duration-150',
          playing
            ? 'opacity-0 pointer-events-none'
            : 'opacity-100 bg-black/38 group-hover:bg-black/28',
        ].join(' ')}
      >
        <div className="w-10 h-10 rounded-full bg-white/22 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
          <Play size={15} className="text-white ml-0.5" fill="white" />
        </div>
      </div>

      {/* Label bar — always visible at bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-xs font-semibold text-white leading-tight">{ex.label}</p>
        <p className="text-[10px] text-white/58 leading-tight">{ex.subtitle}</p>
      </div>
    </div>
  )
}

// ── Exercise video section ────────────────────────────────────────────────────

function ExerciseVideos({ muscleId }: { muscleId: string }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  // When the selection came from the diagnostic tool, use the sub-muscle ID
  // (e.g. 'deltoid_anterior') for a more targeted exercise lookup.
  const subMuscleId = useAtlasStore((s) => s.diagnosticSubMuscleId)

  const exercises = (subMuscleId && EXERCISE_MAP[subMuscleId])
    ? EXERCISE_MAP[subMuscleId]
    : EXERCISE_MAP[muscleId]
  if (!exercises) return null

  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700/60">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">
        <Play size={10} />
        Exercises
      </div>

      <div className="flex flex-col gap-2">
        {exercises.map((ex) => (
          <VideoCard
            key={ex.id}
            ex={ex}
            isActive={activeId === ex.id}
            onSelect={() => setActiveId(ex.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Section row ───────────────────────────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
}: {
  icon:  React.ReactNode
  label: string
  value: string | undefined | null
}) {
  if (!value) return null
  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{value}</p>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-500 px-4 text-center">
      <MousePointerClick size={32} strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium mb-1">Select a Structure</p>
        <p className="text-xs leading-relaxed">
          Click any muscle in the 3D viewer, or pick one from the list on the left.
        </p>
      </div>
    </div>
  )
}

// ── Pain Voice Button ──────────────────────────────────────────────────────────

/** Expand common medical shorthand so the TTS reads them as words, not letters. */
function prepareTextForSpeech(raw: string): string {
  return raw
    // Anatomical directions
    .replace(/\bant\./gi, 'anterior')
    .replace(/\bpost\./gi, 'posterior')
    .replace(/\blat\./gi, 'lateral')
    .replace(/\bmed\./gi, 'medial')
    .replace(/\bsup\./gi, 'superior')
    .replace(/\binf\./gi, 'inferior')
    // Common abbreviations
    .replace(/\bm\./gi, 'muscle')
    .replace(/\bnn?\./gi, 'nerve')
    .replace(/\bv\./gi, 'vein')
    .replace(/\ba\./gi, 'artery')
    .replace(/\bL(\d)/g, 'lumbar $1')
    .replace(/\bC(\d)/g, 'cervical $1')
    .replace(/\bT(\d)/g, 'thoracic $1')
    // Ensure sentences have breathing room (comma before conjunctions in long text)
    .replace(/([^,])\s+(and|but|which|causing|resulting)\s/gi, '$1, $2 ')
    // Replace semicolons with commas for more natural pausing
    .replace(/;/g, ',')
    .trim()
}

/** Pick the most human-sounding available voice. */
function pickBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  // 1. Microsoft Neural voices (Edge/Windows — best quality available in browser)
  const msNeural = voices.find((v) =>
    v.name.includes('Natural') && v.name.startsWith('Microsoft') && v.lang.startsWith('en')
  )
  if (msNeural) return msNeural

  // 2. Any Microsoft online English voice
  const msOnline = voices.find((v) =>
    v.name.startsWith('Microsoft') && !v.localService && v.lang.startsWith('en')
  )
  if (msOnline) return msOnline

  // 3. Google online voices (Chrome)
  const google = voices.find((v) =>
    v.name.startsWith('Google') && v.lang.startsWith('en')
  )
  if (google) return google

  // 4. Any online (server-side) English voice
  const onlineEn = voices.find((v) => v.lang.startsWith('en') && !v.localService)
  if (onlineEn) return onlineEn

  // 5. Preferred local voices (macOS / iOS — actually sound decent)
  const goodLocals = ['Samantha', 'Karen', 'Tessa', 'Nicky', 'Alex']
  for (const name of goodLocals) {
    const v = voices.find((v) => v.name === name)
    if (v) return v
  }

  // 6. Any English voice
  return voices.find((v) => v.lang.startsWith('en')) ?? voices[0] ?? null
}

function PainVoiceButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Voices load asynchronously in Chrome; re-render when ready
  const [voicesReady, setVoicesReady] = useState(false)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const update = () => setVoicesReady(window.speechSynthesis.getVoices().length > 0)
    window.speechSynthesis.addEventListener('voiceschanged', update)
    if (window.speechSynthesis.getVoices().length > 0) setVoicesReady(true)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  // Stop if the displayed text changes (user switched muscle)
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); setSpeaking(false) }
  }, [text])

  if (!('speechSynthesis' in window)) return null

  const play = () => {
    const synth = window.speechSynthesis
    synth.cancel()

    const cleaned = prepareTextForSpeech(text)
    const utt = new SpeechSynthesisUtterance(cleaned)
    const voice = pickBestVoice()
    if (voice) utt.voice = voice

    // Slightly slower than default so neural voices sound measured, not rushed.
    // Pitch stays at 1.0 (neutral) — neural voices already have natural inflection
    // baked in; nudging pitch higher makes them sound synthetic.
    utt.rate  = 0.90
    utt.pitch = 1.0
    utt.lang  = 'en-US'
    utt.onend   = () => setSpeaking(false)
    utt.onerror = () => setSpeaking(false)
    utterRef.current = utt
    setSpeaking(true)
    synth.speak(utt)
  }

  const stop = () => { window.speechSynthesis.cancel(); setSpeaking(false) }

  return (
    <button
      onClick={speaking ? stop : play}
      disabled={!voicesReady}
      title={speaking ? 'Stop' : 'Read aloud'}
      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {speaking
        ? <Square size={10} fill="currentColor" />
        : <Volume2 size={10} />
      }
    </button>
  )
}

// ── Likely Sources Component ───────────────────────────────────────────────────

function LikelySources({ result, onClose }: { result: DiagnosticResult; onClose?: () => void }) {
  const setSelected        = useAtlasStore((s) => s.setSelected)
  const setHovered         = useAtlasStore((s) => s.setHovered)
  const setDiagnosticPulse = useAtlasStore((s) => s.setDiagnosticPulse)
  const setDiagnostic      = useAtlasStore((s) => s.setDiagnostic)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const { contributions, clickPoint } = result
  const clickVec = useMemo(() => new THREE.Vector3(...clickPoint), [clickPoint])
  const grouped  = useMemo(() => groupContributionsForDisplay(contributions), [contributions])

  const hoverItem = (meshIds: string[]) => {
    const id = pickSideFromClick(meshIds, clickVec)
    if (!id) return
    setHovered(id)
    setDiagnosticPulse(id)
  }
  const unhoverItem = () => { setHovered(null); setDiagnosticPulse(null) }

  const selectItem = (meshIds: string[]) => {
    const id = pickSideFromClick(meshIds, clickVec)
    if (!id) return
    setDiagnosticPulse(null)
    setDiagnostic(null)   // also clears candidateIds via store action
    setSelected(id)
  }

  const toggleGroup = (label: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label); else next.add(label)
      return next
    })

  // Bar color helpers
  const barColor = (matchType: 'primary' | 'referred' | 'mixed') =>
    matchType === 'primary' ? '#FF8C00' : matchType === 'mixed' ? '#F59E0B' : '#B45309'

  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700/60">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-500 dark:text-amber-400 uppercase tracking-wide">
          <Activity size={10} />
          Likely Sources
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="truncate max-w-[110px]">{result.clickedZones.slice(0, 2).join(', ')}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 ml-1 flex-shrink-0"
              aria-label="Dismiss"
            >✕</button>
          )}
        </div>
      </div>

      {contributions.length === 0 ? (
        <p className="text-xs text-slate-400 px-1">No patterns match this area.</p>
      ) : (
        <ul className="space-y-1">
          {grouped.map((item: DiagnosticDisplayItem) => {
            if (isGrouped(item)) {
              const isExpanded = expandedGroups.has(item.label)
              return (
                <li key={item.label}>
                  {/* Group header */}
                  <div
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 cursor-pointer select-none hover:bg-slate-800/60 transition-colors"
                    onMouseEnter={() => hoverItem(item.meshIds)}
                    onMouseLeave={unhoverItem}
                    onClick={() => toggleGroup(item.label)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-slate-400 flex-shrink-0">
                        {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </span>
                      <span className="text-sm font-medium text-slate-200 truncate">{item.label}</span>
                      <span className="text-[10px] text-slate-500 ml-0.5 flex-shrink-0">group</span>
                    </div>
                    <div className="ml-3 flex w-24 items-center gap-2 flex-shrink-0">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full transition-all"
                          style={{
                            width:           `${Math.min(100, Math.round(item.totalProbability * 100))}%`,
                            backgroundColor: barColor(item.matchType),
                          }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-neutral-200">
                        {Math.round(item.totalProbability * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Children — collapsed by default */}
                  {isExpanded && (
                    <ul className="ml-5 mt-0.5 space-y-0.5">
                      {item.members.map((child) => (
                        <li key={child.muscle_id}>
                          <button
                            onMouseEnter={() => hoverItem(child.meshIds)}
                            onMouseLeave={unhoverItem}
                            onClick={() => selectItem(child.meshIds)}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-slate-700/60 transition-colors"
                          >
                            <span className="text-xs text-slate-300 truncate flex-1">{child.common_name}</span>
                            <div className="ml-3 flex w-20 items-center gap-2 flex-shrink-0">
                              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-neutral-800">
                                <div
                                  className="absolute left-0 top-0 h-full rounded-full"
                                  style={{
                                    width:           `${Math.round(child.probability * 100)}%`,
                                    backgroundColor: barColor(child.matchType),
                                  }}
                                />
                              </div>
                              <span className="w-8 text-right text-[10px] tabular-nums text-neutral-400">
                                {Math.round(child.probability * 100)}%
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            }

            // Flat muscle row — TypeScript narrowing: after isGrouped guard, item is MuscleContribution
            const flat = item as MuscleContribution
            return (
              <li key={flat.muscle_id}>
                <button
                  onMouseEnter={() => hoverItem(flat.meshIds)}
                  onMouseLeave={unhoverItem}
                  onClick={() => selectItem(flat.meshIds)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-slate-800/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-200 truncate">{flat.common_name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {flat.matchType === 'primary' ? 'primary zone' : 'referred zone'}
                    </div>
                  </div>
                  <div className="ml-3 flex w-24 items-center gap-2 flex-shrink-0">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width:           `${Math.round(flat.probability * 100)}%`,
                          backgroundColor: barColor(flat.matchType),
                        }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-neutral-200">
                      {Math.round(flat.probability * 100)}%
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function MetadataPanel() {
  const selectedId       = useAtlasStore((s) => s.selectedId)
  const diagnosticResult = useAtlasStore((s) => s.diagnosticResult)
  const sceneIndex       = useAtlasStore((s) => s.sceneIndex)
  const hideSelected     = useAtlasStore((s) => s.hideSelected)
  const isolateSelected  = useAtlasStore((s) => s.isolateSelected)
  const isolateMode      = useAtlasStore((s) => s.isolateMode)
  const exitIsolate      = useAtlasStore((s) => s.exitIsolate)
  const showPainOverlay  = useAtlasStore((s) => s.showPainOverlay)
  const togglePainOverlay = useAtlasStore((s) => s.togglePainOverlay)
  const [speaking, setSpeaking] = useState(false)

  const meta = selectedId ? sceneIndex.metadataById.get(selectedId) : undefined
  const pain = selectedId ? PAIN_PATTERNS[selectedId] : undefined

  if (!selectedId && !diagnosticResult) return <EmptyState />

  const speakPainPattern = () => {
    if (!pain || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(pain.description)
    utter.rate = 0.95
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utter)
  }

  const stopPainPattern = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug mb-2">
          {meta?.displayName}
        </h2>
        <div className="flex flex-wrap gap-1">
          <Badge color={systemBadgeColor(meta?.system ?? 'muscle')}>
            {SYSTEM_LABELS[meta?.system ?? ''] ?? meta?.system}
          </Badge>
          <Badge color={layerBadgeColor(meta?.layer ?? 'superficial')}>
            {LAYER_LABELS[meta?.layer ?? ''] ?? meta?.layer}
          </Badge>
          <Badge color="slate">
            {SIDE_LABELS[meta?.side ?? ''] ?? meta?.side}
          </Badge>
          <Badge color="slate">
            {REGION_LABELS[meta?.region ?? ''] ?? meta?.region}
          </Badge>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <Button size="sm" variant="secondary" onClick={hideSelected}>
          Hide
        </Button>
        <Button
          size="sm"
          variant={isolateMode ? 'primary' : 'secondary'}
          onClick={isolateMode ? exitIsolate : isolateSelected}
        >
          {isolateMode ? 'Exit Isolate' : 'Isolate'}
        </Button>
      </div>

      {/* Scrollable detail rows */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {selectedId && <ExerciseVideos muscleId={selectedId} />}

        <MetaRow
          icon={<Activity size={10} />}
          label="Pain Referral Pattern"
          value={pain?.description}
        />
        {pain && (
          <div className="mb-2 -mt-2 flex items-center justify-end gap-2">
            <button
              onClick={speaking ? stopPainPattern : speakPainPattern}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Read pain referral pattern aloud"
            >
              {speaking ? <Square size={10} /> : <Mic size={10} />}
              {speaking ? 'Stop voice' : 'Voice'}
            </button>
            <button
              onClick={togglePainOverlay}
              className={[
                'text-[10px] px-2 py-0.5 rounded border font-medium transition-colors',
                showPainOverlay
                  ? 'border-red-300 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700'
                  : 'border-slate-200 text-slate-400 bg-transparent dark:border-slate-600',
              ].join(' ')}
            >
              {showPainOverlay ? '● On' : '○ Off'}
            </button>
          </div>
        )}
        <MetaRow
          icon={<MapPin size={10} />}
          label="Origin"
          value={meta?.origin}
        />
        <MetaRow
          icon={<Zap size={10} />}
          label="Action"
          value={meta?.action}
        />
        <MetaRow
          icon={<StickyNote size={10} />}
          label="Intervention"
          value={meta?.notes}
        />
      </div>
    </div>
  )
}
