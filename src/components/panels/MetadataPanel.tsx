import React, { useRef, useState } from 'react'
import { MousePointerClick, Tag, Layers, MapPin, ArrowRightLeft, Zap, Brain, StickyNote, Hash, Activity, Play, Pause, RotateCcw } from 'lucide-react'
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

const EXERCISE_MAP: Record<string, ExerciseDef[]> = {
  MUSC_BICEPS_FEMORIS_R: [
    { id: 'hamstring_squeeze', label: 'Hamstring Squeeze',   subtitle: 'Isometric activation',  src: '/videos/Hamstring_Squeeze.mp4'   },
    { id: 'glute_bridge',     label: 'Glute Bridge',        subtitle: 'Hip extension & loading', src: '/videos/Glute_Bridge_Exercise.mp4' },
    { id: 'hip_hinge',        label: 'Hip Hinge',           subtitle: 'Eccentric hamstring',    src: '/videos/Hip_Hinge_Exercise.mp4'  },
  ],
  MUSC_BICEPS_FEMORIS_L: [
    { id: 'hamstring_squeeze', label: 'Hamstring Squeeze',   subtitle: 'Isometric activation',  src: '/videos/Hamstring_Squeeze.mp4'   },
    { id: 'glute_bridge',     label: 'Glute Bridge',        subtitle: 'Hip extension & loading', src: '/videos/Glute_Bridge_Exercise.mp4' },
    { id: 'hip_hinge',        label: 'Hip Hinge',           subtitle: 'Eccentric hamstring',    src: '/videos/Hip_Hinge_Exercise.mp4'  },
  ],
}

// ── Exercise video section ────────────────────────────────────────────────────

function ExerciseVideos({ muscleId }: { muscleId: string }) {
  const exercises = EXERCISE_MAP[muscleId]
  if (!exercises) return null

  const [activeId, setActiveId] = useState<string | null>(null)
  const [playing,  setPlaying]  = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const activeEx = exercises.find((e) => e.id === activeId) ?? null

  function selectExercise(ex: ExerciseDef) {
    if (activeId === ex.id) return   // already open
    setActiveId(ex.id)
    setPlaying(false)
    // Brief timeout so the src can update before we reference the element
    setTimeout(() => { videoRef.current?.load() }, 0)
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else          { v.pause(); setPlaying(false) }
  }

  function restart() {
    const v = videoRef.current
    if (!v) return
    v.currentTime = 0
    v.play()
    setPlaying(true)
  }

  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700/60">
      {/* Section header */}
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">
        <Play size={10} />
        Exercises
      </div>

      {/* Exercise list */}
      <div className="flex flex-col gap-1 mb-2">
        {exercises.map((ex) => {
          const isActive = ex.id === activeId
          return (
            <button
              key={ex.id}
              onClick={() => selectExercise(ex)}
              className={[
                'w-full text-left px-2.5 py-2 rounded-md border transition-colors',
                isActive
                  ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/25'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <div className={[
                  'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center',
                  isActive
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300',
                ].join(' ')}>
                  <Play size={8} />
                </div>
                <div>
                  <p className={[
                    'text-xs font-medium leading-none mb-0.5',
                    isActive
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-700 dark:text-slate-200',
                  ].join(' ')}>{ex.label}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{ex.subtitle}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Inline video player — shown when an exercise is selected */}
      {activeEx && (
        <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black">
          <video
            ref={videoRef}
            src={activeEx.src}
            className="w-full"
            preload="metadata"
            playsInline
            onEnded={() => setPlaying(false)}
          />
          {/* Simple controls */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900">
            <button
              onClick={togglePlay}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              onClick={restart}
              className="flex items-center justify-center w-6 h-6 rounded text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RotateCcw size={12} />
            </button>
            <span className="text-[10px] text-slate-400 font-medium truncate">{activeEx.label}</span>
          </div>
        </div>
      )}
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

// ── Synonyms row ──────────────────────────────────────────────────────────────

function SynonymsRow({ synonyms }: { synonyms: string[] }) {
  if (!synonyms || synonyms.length === 0) return null
  return (
    <div className="py-2 border-b border-slate-100 dark:border-slate-700/60">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
        <Tag size={10} />
        Synonyms
      </div>
      <div className="flex flex-wrap gap-1">
        {synonyms.map((s) => (
          <Badge key={s} color="slate">{s}</Badge>
        ))}
      </div>
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

  const meta = selectedId ? sceneIndex.metadataById.get(selectedId) : undefined
  const pain = selectedId ? PAIN_PATTERNS[selectedId] : undefined

  if (!selectedId || !meta) return <EmptyState />

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
        <SynonymsRow synonyms={meta.synonyms} />

        <MetaRow
          icon={<MapPin size={10} />}
          label="Origin"
          value={meta.origin}
        />
        <MetaRow
          icon={<ArrowRightLeft size={10} />}
          label="Insertion"
          value={meta.insertion}
        />
        <MetaRow
          icon={<Zap size={10} />}
          label="Action"
          value={meta.action}
        />
        <MetaRow
          icon={<Brain size={10} />}
          label="Innervation"
          value={meta.innervation}
        />
        <MetaRow
          icon={<StickyNote size={10} />}
          label="Notes"
          value={meta.notes}
        />

        {/* ── Pain Referral Pattern ──────────────────────────────────────── */}
        {pain && (
          <div className="py-2 border-b border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide">
                <Activity size={10} />
                Pain Referral Pattern
              </div>
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
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {pain.description}
            </p>
          </div>
        )}

        {/* ── Exercise Videos (demo: biceps femoris only) ────────────────── */}
        <ExerciseVideos muscleId={selectedId} />

        {/* Structure ID */}
        <div className="pt-3 mt-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-300 dark:text-slate-600 uppercase tracking-wide mb-0.5">
            <Hash size={10} />
            Structure ID
          </div>
          <code className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{meta.id}</code>
        </div>

        {/* Mesh names */}
        {meta.meshNames.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-300 dark:text-slate-600 uppercase tracking-wide mb-1">
              <Layers size={10} />
              Mesh Names
            </div>
            <div className="flex flex-col gap-0.5">
              {meta.meshNames.map((n) => (
                <code key={n} className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{n}</code>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
