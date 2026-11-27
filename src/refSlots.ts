import { atom, reactor } from 'tldraw'

import type { RefKind } from './comfy'
import { findMarkers, REF_MARKERS, type Markers } from './customMarkers'
import { listCustomWorkflows, readCustomWorkflow, refVideoFileOf, refVideoFilesAtom, workflowConfigAtom } from './customWorkflows'
import { MAX_VIDEO_REF_KINDS } from './videoGraphs'

export type RefSlots = Record<RefKind, number>

/** Slots per reference-to-video workflow file, so each option in the model menu keeps its own counts. */
export const refSlotsByFileAtom = atom<Record<string, RefSlots>>('ref slots by file', {})

function slotsOf(markers: Markers): RefSlots {
  const slots: RefSlots = { image: 0, video: 0, audio: 0 }
  for (const kind of ['image', 'video', 'audio'] as const) slots[kind] = REF_MARKERS[kind].filter((m) => markers[m]).length
  return slots
}

export function refSlotsOf(file: string | undefined | null): RefSlots {
  if (!file) return { ...MAX_VIDEO_REF_KINDS }
  return refSlotsByFileAtom.get()[file] ?? { ...MAX_VIDEO_REF_KINDS }
}

/** Slots for the workflow a generator is set to; falls back to the assigned default workflow. */
export function refSlotsFor(workflow?: string | null): RefSlots {
  return refSlotsOf(refVideoFileOf(workflow) ?? workflowConfigAtom.get().refVideo)
}

export const videoRefSlots = () => refSlotsFor(null)

export function videoRefCapacity(workflow?: string | null) {
  const slots = refSlotsFor(workflow)
  return slots.image + slots.video + slots.audio
}

export async function loadVideoRefSlots() {
  const files = refVideoFilesAtom.get().length ? refVideoFilesAtom.get() : await listCustomWorkflows('refVideo')
  const rows = await Promise.all(files.map(async (file) => {
    const graph = await readCustomWorkflow('refVideo', file).catch(() => null)
    return [file, graph ? slotsOf(findMarkers(graph)) : { ...MAX_VIDEO_REF_KINDS }] as const
  }))
  refSlotsByFileAtom.set(Object.fromEntries(rows))
}

reactor('video ref slots', () => {
  refVideoFilesAtom.get()
  workflowConfigAtom.get().refVideo
  void loadVideoRefSlots().catch(() => undefined)
})
