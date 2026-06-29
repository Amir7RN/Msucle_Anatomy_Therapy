/**
 * HeartRateWidget.tsx — live BLE heart rate for MoveMate Train.
 *
 * Connects to any standard Bluetooth heart-rate sensor and streams BPM into the
 * gym store. (See lib/gym/health.ts for why a website can't read an Apple Watch
 * directly, and the companion-app upgrade path.)
 */

import React, { useCallback, useState } from 'react'
import { Heart, Bluetooth, Loader2, X } from 'lucide-react'
import { useGymStore } from '../../store/gymStore'
import { connectHeartRate, isWebBluetoothAvailable, heartRateZone, type HeartRateHandle } from '../../lib/gym/health'

const ZONE_COLOR = ['', 'text-sky-300', 'text-emerald-300', 'text-amber-300', 'text-orange-300', 'text-rose-400']

export function HeartRateWidget({ ageYears = null, compact = false }: { ageYears?: number | null; compact?: boolean }) {
  const liveBpm      = useGymStore((s) => s.liveBpm)
  const deviceName   = useGymStore((s) => s.hrDeviceName)
  const setLiveBpm   = useGymStore((s) => s.setLiveBpm)
  const setHrDevice  = useGymStore((s) => s.setHrDevice)
  const [handle, setHandle] = useState<HeartRateHandle | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const connect = useCallback(async () => {
    setErr(null)
    if (!isWebBluetoothAvailable()) {
      setErr('Web Bluetooth needs Chrome or Edge (desktop/Android). On iPhone, import Apple Health instead.')
      return
    }
    setConnecting(true)
    try {
      const h = await connectHeartRate(
        (bpm) => setLiveBpm(bpm),
        () => { setLiveBpm(null); setHrDevice(null); setHandle(null) },
      )
      setHandle(h); setHrDevice(h.deviceName)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not connect.'
      if (!/cancelled|User cancelled/i.test(msg)) setErr(msg)
    } finally {
      setConnecting(false)
    }
  }, [setLiveBpm, setHrDevice])

  const disconnect = useCallback(() => {
    handle?.disconnect(); setHandle(null); setHrDevice(null); setLiveBpm(null)
  }, [handle, setHrDevice, setLiveBpm])

  const zone = liveBpm != null ? heartRateZone(liveBpm, ageYears) : null

  if (liveBpm != null) {
    return (
      <div className={['flex items-center gap-2 rounded-xl bg-rose-950/40 ring-1 ring-rose-500/30',
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2'].join(' ')}>
        <Heart size={compact ? 15 : 18} className="animate-pulse text-rose-400" fill="currentColor" />
        <div className="leading-none">
          <div className="flex items-baseline gap-1">
            <span className={['font-bold tabular-nums', compact ? 'text-base' : 'text-xl'].join(' ')}>{liveBpm}</span>
            <span className="text-[10px] text-rose-200/80">bpm</span>
          </div>
          {zone && !compact && (
            <div className={['text-[10px] font-medium', ZONE_COLOR[zone.zone]].join(' ')}>Z{zone.zone} · {zone.label}</div>
          )}
        </div>
        {!compact && (
          <button onClick={disconnect} className="ml-1 rounded p-1 text-rose-200/60 hover:bg-rose-900/40 hover:text-rose-100" title={`Disconnect ${deviceName ?? ''}`}>
            <X size={13} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className={['flex items-center gap-2 rounded-xl bg-slate-800/70 font-semibold text-rose-200 ring-1 ring-rose-500/30 transition hover:bg-rose-950/40 disabled:opacity-60',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'].join(' ')}
      >
        {connecting ? <Loader2 size={15} className="animate-spin" /> : <Bluetooth size={15} />}
        {connecting ? 'Pairing…' : 'Connect heart rate'}
      </button>
      {err && <span className="max-w-[220px] text-[10px] leading-tight text-orange-300/90">{err}</span>}
    </div>
  )
}
