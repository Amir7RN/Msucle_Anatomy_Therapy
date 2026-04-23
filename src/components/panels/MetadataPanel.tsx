import React, { useEffect, useRef, useState } from 'react'
import { MousePointerClick, MapPin, Zap, StickyNote, Activity, Play, Mic, Square } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { Badge, systemBadgeColor, layerBadgeColor } from '../ui/Badge'
import { Button } from '../ui/Button'
import { REGION_LABELS, SIDE_LABELS, SYSTEM_LABELS, LAYER_LABELS } from '../../lib/structureMapper'
import { PAIN_PATTERNS } from '../../data/painPatterns'

// ── Exercise video data ───────────────────────────────────────────────────────

interface ExerciseDef {
  id:       string
  label:    string
  subtitle: string
  src:      string
}

// Use BASE_URL so paths work both in local dev (/) and GitHub Pages (/Msucle_Anatomy_Therapy/)
const V = (file: string) => `${import.meta.env.BASE_URL}videos/${file}`

const DELTOID_EXERCISES: ExerciseDef[] = [
  { id: 'crab_press',            label: 'Crab Press',               subtitle: 'Shoulder activation',       src: V('Crab_Press.mp4')               },
  { id: 'doorway_stretch',       label: 'Doorway Stretch',          subtitle: 'Anterior deltoid release',  src: V('DoorWay_Stretch.mp4')          },
  { id: 'hand_behind_back',      label: 'Hand Behind Back Stretch', subtitle: 'Internal rotation mob.',    src: V('Hand_Behind_Back_Stretch.mp4') },
  { id: 'seated_cross_arm',      label: 'Seated Cross-Arm Stretch', subtitle: 'Posterior deltoid stretch', src: V('Seated_Cross_Arm_Stretch.mp4') },
  { id: 'standing_chest',        label: 'Standing Chest Stretch',   subtitle: 'Pec & anterior delt',      src: V('Standing_Chest_Stretch.mp4')   },
  { id: 'standing_sleeper',      label: 'Sleeper Stretch',          subtitle: 'Posterior capsule mob.',    src: V('Standing_Sleeper_Stretch.mp4') },
]

const EXERCISE_MAP: Record<string, ExerciseDef[]> = {
  MUSC_DELTOID_R: DELTOID_EXERCISES,
  MUSC_DELTOID_L: DELTOID_EXERCISES,
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

  const exercises = EXERCISE_MAP[muscleId]
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

// ── Main panel ────────────────────────────────────────────────────────────────

export function MetadataPanel() {
  const selectedId       = useAtlasStore((s) => s.selectedId)
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

  if (!selectedId || !meta) return <EmptyState />

  const speakPainPattern = () => {
    if (!pain || typeof window === 'undefined' || !window.speechSynthesis) return
    const voices = window.speechSynthesis.getVoices()
    const preferredVoice = voices.find((v) =>
      /Natural|Siri|Google US English|Aria|Jenny|Neural/i.test(v.name),
    ) ?? voices.find((v) => /en-US|en_US/i.test(v.lang)) ?? voices[0]

    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(
      `Pain referral pattern. ${pain.description}`,
    )
    if (preferredVoice) utter.voice = preferredVoice
    utter.lang = preferredVoice?.lang ?? 'en-US'
    utter.rate = 0.9
    utter.pitch = 1.0
    utter.volume = 1
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
          {meta.displayName}
        </h2>
        <div className="flex flex-wrap gap-1">
          <Badge color={systemBadgeColor(meta.system)}>
            {SYSTEM_LABELS[meta.system] ?? meta.system}
          </Badge>
          <Badge color={layerBadgeColor(meta.layer)}>
            {LAYER_LABELS[meta.layer] ?? meta.layer}
          </Badge>
          <Badge color="slate">
            {SIDE_LABELS[meta.side] ?? meta.side}
          </Badge>
          <Badge color="slate">
            {REGION_LABELS[meta.region] ?? meta.region}
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
        <ExerciseVideos muscleId={selectedId} />

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
          value={meta.origin}
        />
        <MetaRow
          icon={<Zap size={10} />}
          label="Action"
          value={meta.action}
        />
        <MetaRow
          icon={<StickyNote size={10} />}
          label="Intervention"
          value={meta.notes}
        />
      </div>
    </div>
  )
}
