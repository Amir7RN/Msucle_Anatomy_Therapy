/**
 * LeftSidebar.tsx
 *
 * Sidebar layout: the FeatureRail (the platform's five core experiences as
 * rich clickable cards) sits on top; the AI Diagnosis chat fills the
 * remaining height below it.
 *
 * The old fixed-height Structures tree was removed — anatomy browsing lives
 * in the 3D canvas (click/isolate) and the header search, and the vertical
 * space is far better spent making the flagship features discoverable.
 */

import React from 'react'
import { TriageChat } from '../triage/TriageChat'
import { FeatureRail } from './FeatureRail'

const noop = () => undefined

const chatSlotStyle: React.CSSProperties = {
  flex:      '1 1 0',
  minHeight: 0,
}

export function LeftSidebar() {
  return (
    <aside className="flex flex-col border-r border-slate-700 bg-slate-900 flex-shrink-0 overflow-hidden w-full md:w-[300px] h-full">
      {/* Feature deck — desktop only (mobile reaches these via the bottom nav). */}
      <div className="hidden md:block">
        <FeatureRail />
      </div>
      <div className="flex flex-col min-h-0 overflow-hidden" style={chatSlotStyle}>
        <TriageChat open onClose={noop} inline />
      </div>
    </aside>
  )
}
