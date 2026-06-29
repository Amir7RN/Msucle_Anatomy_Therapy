/**
 * gymStore.ts
 *
 * Dedicated state for ZevaMMT (the gym-training platform). Kept separate
 * from atlasStore so the two platforms stay independent in look and behaviour.
 */

import { create } from 'zustand'
import type { MuscleGroupId } from '../lib/gym/exercises'
import type { HealthSummary } from '../lib/gym/health'

export type GymView = 'home' | 'group' | 'trainer' | 'scan'

/** One logged set from a finished trainer session. */
export interface SetLog {
  exerciseId:   string
  exerciseName: string
  group:        MuscleGroupId
  reps:         number
  peakActivation: number   // 0..1
  romDeg:       number
  avgBpm?:      number
  at:           number
}

/** A captured body-part scan data point for trend tracking. */
export interface PartScan {
  group:       MuscleGroupId
  at:          number
  /** crude muscle-volume proxy (limb girth in normalised px) + body-fat estimate */
  girthIndex?: number
  bodyFatPct?: number
  note?:       string
}

interface GymState {
  view:              GymView
  selectedGroup:     MuscleGroupId | null
  selectedExercise:  string | null

  // wearable / health
  liveBpm:           number | null
  hrDeviceName:      string | null
  health:            HealthSummary | null

  // history
  setLogs:           SetLog[]
  partScans:         PartScan[]

  // actions
  openGroup:    (g: MuscleGroupId) => void
  openTrainer:  (exerciseId: string) => void
  openScan:     (g: MuscleGroupId) => void
  goHome:       () => void
  back:         () => void

  setLiveBpm:   (bpm: number | null) => void
  setHrDevice:  (name: string | null) => void
  setHealth:    (h: HealthSummary | null) => void

  logSet:       (s: SetLog) => void
  logPartScan:  (s: PartScan) => void
}

export const useGymStore = create<GymState>((set, get) => ({
  view: 'home',
  selectedGroup: null,
  selectedExercise: null,

  liveBpm: null,
  hrDeviceName: null,
  health: null,

  setLogs: [],
  partScans: [],

  openGroup:   (g) => set({ view: 'group', selectedGroup: g }),
  openTrainer: (exerciseId) => set({ view: 'trainer', selectedExercise: exerciseId }),
  openScan:    (g) => set({ view: 'scan', selectedGroup: g }),
  goHome:      () => set({ view: 'home', selectedExercise: null }),
  back: () => {
    const { view, selectedGroup } = get()
    if (view === 'trainer' || view === 'scan') set({ view: selectedGroup ? 'group' : 'home', selectedExercise: null })
    else set({ view: 'home', selectedGroup: null })
  },

  setLiveBpm:  (bpm) => set({ liveBpm: bpm }),
  setHrDevice: (name) => set({ hrDeviceName: name }),
  setHealth:   (h) => set({ health: h }),

  logSet:      (s) => set((st) => ({ setLogs: [s, ...st.setLogs].slice(0, 200) })),
  logPartScan: (s) => set((st) => ({ partScans: [s, ...st.partScans].slice(0, 200) })),
}))
