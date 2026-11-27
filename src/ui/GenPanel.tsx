import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor, useValue } from 'tldraw'

import { cloudMode, refKind, thumbUrl, uploadImage, validTarget, viewUrl, type RefKind } from '../comfy'
import { planStoryboard } from '../agent'
import { baseOf, capRefs, colorsOf, generate, lastFrameOf, motionOf, refsOf, runOnOf, scenesOf, speechOf, targetSize, videoModeOf } from '../generate'
import { canvasPickAtom, fillTarget, isMediaRefs, maxRefsOf, type Target } from '../genInputs'
import type { Scene } from '../videoGraphs'
import { refSlotsFor } from '../refSlots'
import { itemImages, libraryAtom } from '../library'
import { DEFAULT_STRENGTH, modeOf, modesFor, refControlsOf, refModeFor, refModesOf, refStrengthsOf, usableRefs } from '../refModes'
import { RefControls } from './RefControls'
import { errorText, jobOf } from '../jobs'
import type { GeneratorShape } from '../shapes/GeneratorShape'
import { installedModels, isVideo, modelOf, VIDEO_MODELS } from '../models'
import { effectiveRefWorkflow, refVideoFileOf, refVideoFilesAtom } from '../customWorkflows'
import { readLocal, writeLocal } from '../localPrefs'
import { instancesAtom } from '../instances'
import { AssetGrid } from './AssetPicker'
import { ColorPicker } from './ColorPicker'
import { AdvancedPill } from './GenAdvanced'
import { ModelPill, RunOnPill, SettingsPill } from './GenSettings'
import { Icons } from './icons'
import { StoryboardEditor } from './StoryboardEditor'
import { MentionTextarea } from './MentionInput'
import type { Mention } from '../mentions'
import { Popover } from './Popover'
import { useElementSize, useSelectedGenerator, useSelectionRect } from './selection'
import { t } from '../i18n'

const GAP = 12
const PROMPT_H = 'comfyart-gen-prompt-h'
const PROMPT_W = 'comfyart-gen-panel-w'
const PROMPT_MIN = 56
/** The prompt box on first open: the old 56-160 auto height was too cramped for real prompts. */
const PROMPT_H_DEFAULT = 132
const PANEL_MIN = 360
const PANEL_MAX = 920
/** Free-resize grips live on the bottom edge only: the panel is anchored to the
 *  generator above it, so top corners had nothing to push against. */
const CORNERS = ['bl', 'br'] as const

const TAGS: Record<RefKind, string> = { image: 'genPanel.tagImage', video: 'genPanel.tagVideo', audio: 'genPanel.tagAudio' }
const CAPTIONS: Record<RefKind, string> = { image: 'genPanel.mentionImage', video: 'genPanel.mentionVideo', audio: 'genPanel.mentionAudio' }

/** The five tabs of a video generator; each one keeps its own references and prompt. */
type ModeKey = 'frames' | 'refs' | 'motion' | 'lipsync' | 'story'
type ModeExtra = { lastFrame?: string | null; motion?: string | null; speech?: string | null }

function RefMedia({ src }: { src: string }) {
  const kind = refKind(src)
  if (kind === 'video') return <video src={src} muted preload="metadata" />
  if (kind === 'audio') return <span className="ca-gen__refaudio ca-icon">{Icons.music}</span>
  return <img src={src} alt="" />
}

export function GenPanel({ onError }: { onError: (msg: string) => void }) {
  const editor = useEditor()
  const shape = useSelectedGenerator()
  const rect = useSelectionRect()
  const panel = useRef<HTMLDivElement>(null)
  const prompt = useRef<HTMLDivElement>(null)
  const size = useElementSize(panel, { w: 680, h: 200 })
  const [promptH, setPromptH] = useState(() => Number(readLocal(PROMPT_H)) || PROMPT_H_DEFAULT)
  const [panelW, setPanelW] = useState(() => Number(readLocal(PROMPT_W)) || 0)
  const dragging = useRef(false)
  /** The height the prompt box gets: purely the user's pick (canvas-scale pixels). */
  const shownH = promptH
  const [pick, setPick] = useState<{ to: Target; view: 'menu' | 'assets' | 'library' } | null>(null)
  const [modeOpen, setModeOpen] = useState<string | null>(null)
  const [smart, setSmart] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const uploadTo = useRef<Target>('ref')
  const models = useValue('gen models', () => {
    if (!shape) return installedModels(false)
    const video = isVideo(shape.props.workflow)
    const refs = video && !Array.isArray(shape.meta.scenes) && videoModeOf(shape) === 'refs'
    return installedModels(video, refs)
  }, [shape?.props.workflow, shape?.meta.videoMode, shape?.meta.scenes])
  const running = useValue('gen running', () => !!(shape && jobOf(editor.getShape(shape.id) ?? shape)), [editor, shape])
  const canvasPick = useValue(canvasPickAtom)
  const lan = useValue('gen lan', () => !cloudMode() && instancesAtom.get().some((i) => i.enabled), [])
  const library = useValue('library images', () => libraryAtom.get().filter((x) => itemImages(x).length), [])
  const slots = useValue('ref slots', () => refSlotsFor(shape?.props.workflow), [shape?.props.workflow])

  // A fresh panel focuses its prompt; where it sits is handled by the effect below.
  useEffect(() => {
    prompt.current?.focus()
  }, [shape?.id])

  /** Horizontal offset the user gave the panel by dragging a corner grip, in screen
   *  pixels from the generator's centre line. It survives panning and dragging the shape
   *  (the panel keeps its place relative to the generator) but a zoom drops it, so the
   *  freshly scaled panel re-centres under its generator. */
  const [nudge, setNudge] = useState<{ key: string; z: number; dl: number } | null>(null)
  const zoom = useValue('gen zoom', () => editor.getCamera().z, [editor])

  // Page bounds ignore the camera, so they tell a shape that was moved apart from a canvas
  // that was panned or zoomed.
  const bounds = shape ? editor.getShapePageBounds(shape.id) : undefined
  const visible = !!(shape && rect && bounds && !running && !canvasPick)
  const anchor = shape && bounds
    ? `${shape.id}|${Math.round(bounds.x)}|${Math.round(bounds.y)}|${Math.round(bounds.w)}|${Math.round(bounds.h)}`
    : ''
  // Use this shape alone, not the whole selection: a multi-select bounding box would put
  // the panel off to one side of its generator, especially after a zoom.
  const view = bounds ? (() => {
    const a = editor.pageToViewport({ x: bounds.minX, y: bounds.minY })
    const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return { l: a.x, r: b.x, b: b.y }
  })() : null
  const nudged = nudge && nudge.key === anchor && nudge.z === zoom ? nudge : null

  // The panel is a floating editor: it always opens at its normal readable screen size, no
  // matter how far the canvas is zoomed out. Only zooming *after* it opened scales it, and
  // then exactly in proportion, so it keeps its bond with the generator while zooming.
  // Re-selecting (a new generator, or the same one after closing the panel) resets the
  // baseline to the current zoom and the panel is full size again.
  const openRef = useRef<{ id: string; z: number } | null>(null)
  if (visible && shape) {
    if (!openRef.current || openRef.current.id !== shape.id) openRef.current = { id: shape.id, z: zoom }
  } else {
    openRef.current = null
  }
  const scale = openRef.current ? zoom / openRef.current.z : 1

  if (!visible) return null
  const p = shape.props
  const update = (patch: Partial<GeneratorShape['props']>) => {
    const next = { ...p, ...patch }
    if (patch.ratio || patch.cw || patch.ch || patch.resolution || patch.workflow) {
      const [w, h] = targetSize(next)
      Object.assign(next, { w, h })
    }
    editor.updateShape<GeneratorShape>({ id: shape.id, type: shape.type, props: next })
  }
  const video = isVideo(p.workflow)
  const refs = refsOf(shape)
  const vmode = video ? (Array.isArray(shape.meta.scenes) ? 'story' : videoModeOf(shape)) : null
  const modeKey = vmode as ModeKey | null
  // Each tab owns its references, its prompt and its single-slot material, so switching
  // to a tab that was never used starts empty instead of inheriting the last one's.
  const modeRefs = (shape.meta.modeRefs as Partial<Record<ModeKey, string[]>> | undefined)
    ?? ((shape.meta.refsKept as string[] | undefined)?.length ? { refs: shape.meta.refsKept as string[] } : {})
  const modePrompts = (shape.meta.modePrompts as Partial<Record<ModeKey, string>> | undefined) ?? {}
  const modeScenes = (shape.meta.modeScenes as Partial<Record<ModeKey, Scene[]>> | undefined) ?? {}
  const modeExtras = (shape.meta.modeExtras as Partial<Record<ModeKey, ModeExtra>> | undefined) ?? {}
  const maxRefs = maxRefsOf(shape)
  const motion = motionOf(shape)
  const speech = speechOf(shape)
  const modes = refModesOf(shape)
  const strengths = refStrengthsOf(shape)
  const controls = refControlsOf(shape)
  const colors = colorsOf(shape)
  const setMeta = (patch: Record<string, unknown>) => editor.updateShape<GeneratorShape>({ id: shape.id, type: shape.type, meta: { ...shape.meta, ...patch } as GeneratorShape['meta'] })
  // Removing a thumbnail drops it from the current tab only; the other tabs keep theirs.
  const setRefs = (next: string[]) => setMeta({ refs: next })
  const setColors = (next: string[]) => setMeta({ colors: next })
  const base = baseOf(shape)
  const last = lastFrameOf(shape)
  const media = isMediaRefs(shape)
  const fill = (to: Target, srcs: string[]) => fillTarget(editor, shape.id, to, srcs)
  const upload = async (files: FileList | null) => {
    const to = uploadTo.current
    const srcs: string[] = []
    for (const f of Array.from(files ?? []).slice(0, to === 'ref' ? undefined : 1)) srcs.push(viewUrl(await uploadImage(f, f.name)))
    await fill(to, srcs)
  }
  const accepts: Partial<Record<Target, string>> = { motion: 'video/*', speech: 'audio/*', ...(media ? { ref: [slots.image > 0 && 'image/*', slots.video > 0 && 'video/*', slots.audio > 0 && 'audio/*'].filter(Boolean).join(',') || 'image/*' } : {}) }
  const assetKind = (to: Target) => (to === 'motion' ? 'video' : to === 'speech' ? null : to === 'ref' && media ? 'all' : 'image')
  const pickFailed = (e: unknown) => onError(errorText(e))
  const imagePicker = (to: Target, label: string) => {
    const kind = assetKind(to)
    const icon = to === 'motion' ? Icons.video : to === 'speech' ? Icons.music : Icons.image
    return (
      <Popover
        open={pick?.to === to}
        onOpenChange={(o) => setPick(o ? { to, view: 'menu' } : null)}
        contentKey={pick?.to === to ? pick.view : 'menu'}
        trigger={({ toggle }) => (
          <button type="button" className="ca-gen__refadd" title={label} onClick={toggle}>
            <span className="ca-icon">{icon}</span><span>{label}</span>
          </button>
        )}
      >
        {pick?.view === 'assets' && kind ? (
          <div className="ca-menu ca-assets-pop"><AssetGrid only={kind === 'all' ? undefined : kind} onPick={(item) => { setPick(null); fill(to, [item.src]).catch(pickFailed) }} /></div>
        ) : pick?.view === 'library' ? (
          <div className="ca-menu ca-assets-pop ca-libpick">
            {library.map((item) => (
              <div key={item.id}>
                <div className="ca-gen__label">{item.name}</div>
                <div className="ca-assets__grid">
                  {itemImages(item).map((src) => (
                    <button key={src} type="button" className="ca-side__cell" onClick={() => { setPick(null); fill(to, [src]).catch(pickFailed) }}><img src={thumbUrl(src)} alt="" loading="lazy" /></button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ca-menu">
            <button type="button" className="ca-menu__item" onClick={() => { setPick(null); uploadTo.current = to; if (file.current) { file.current.multiple = to === 'ref'; file.current.accept = accepts[to] ?? 'image/*'; file.current.click() } }}>
              <span className="ca-icon">{Icons.upload}</span><span className="ca-menu__grow">{kind === 'image' ? t('genPanel.uploadImage') : t('genPanel.uploadFile')}</span>
            </button>
            {kind && (
              <button type="button" className="ca-menu__item" onClick={() => setPick({ to, view: 'assets' })}>
                <span className="ca-icon">{Icons.files}</span><span className="ca-menu__grow">{t('genPanel.chooseFromAssets')}</span><span className="ca-icon">{Icons.next}</span>
              </button>
            )}
            {(kind === 'image' || kind === 'all') && library.length > 0 && (
              <button type="button" className="ca-menu__item" onClick={() => setPick({ to, view: 'library' })}>
                <span className="ca-icon">{Icons.folder}</span><span className="ca-menu__grow">{t('genPanel.chooseFromLibrary')}</span><span className="ca-icon">{Icons.next}</span>
              </button>
            )}
            <button type="button" className="ca-menu__item" onClick={() => { setPick(null); canvasPickAtom.set({ id: shape.id, to }) }}>
              <span className="ca-icon">{Icons.select}</span><span className="ca-menu__grow">{t('genPanel.chooseFromCanvas')}</span>
            </button>
          </div>
        )}
      </Popover>
    )
  }
  const slot = (src: string, label: string, clear: () => void) => (
    <span className="ca-gen__ref"><RefMedia src={src} /><span className="ca-gen__refmode">{label}</span><button type="button" title={t('common.remove')} onClick={clear}>{Icons.close}</button></span>
  )

  const story = video && Array.isArray(shape.meta.scenes)
  const scenes = scenesOf(shape)
  const ready = story ? scenes.some((sc) => sc.prompt.trim())
    : vmode === 'motion' ? !!(refs[0] && motion)
      : vmode === 'lipsync' ? !!(refs[0] && speech)
        : !!p.prompt.trim()
  const setScenes = (next: typeof scenes | null) => setMeta({ scenes: next })
  const smartSplit = async () => {
    setSmart(true)
    try {
      const planned = await planStoryboard(scenes.map((sc) => sc.prompt).filter(Boolean).join('\n'))
      if (planned.length) setScenes(planned)
    } catch (e) {
      onError(errorText(e))
    } finally {
      setSmart(false)
    }
  }
  const submit = () => {
    if (!ready) return
    generate(editor, shape, onError).catch((e) => onError(errorText(e)))
  }
  // The panel is glued to its generator and scales with it, so everything here works in
  // panel scale: a screen pixel is 1/scale of a layout pixel. The top edge stays under the
  // generator, the grips only move the bottom edge (pull down = taller, push up = shorter,
  // the held edge follows the pointer 1:1 on screen). br keeps the left edge, bl moves it.
  const grabResize = (e: ReactPointerEvent<HTMLSpanElement>, corner: 'bl' | 'br') => {
    const input = prompt.current
    const box = panel.current
    if (!input || !box || !view) return
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const z = scale
    const from = {
      x: e.clientX,
      y: e.clientY,
      prompt: input.offsetHeight,
      w: box.offsetWidth,
      fixed: box.offsetHeight - input.offsetHeight,
      // Visual top of the panel right now; it does not move during the drag.
      top: view.b + GAP * z,
      // Offset of the visual left edge from the generator's centre line. When the panel
      // is still centred this is minus half its visual width, so br can pin the left edge.
      dl: nudged ? nudged.dl : -(box.offsetWidth * z) / 2,
    }
    // Height stops where the visual bottom edge would leave the window.
    const maxH = Math.max(
      PROMPT_MIN,
      Math.round(Math.min(innerHeight * 0.62, (innerHeight - 24 - from.top - from.fixed * z) / z)),
    )
    const maxW = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(innerWidth / z)))
    const move = (ev: PointerEvent) => {
      const dy = (ev.clientY - from.y) / z
      const dx = (ev.clientX - from.x) / z
      const h = Math.round(Math.min(maxH, Math.max(PROMPT_MIN, from.prompt + dy)))
      const w = Math.round(Math.min(maxW, Math.max(PANEL_MIN, corner === 'br' ? from.w + dx : from.w - dx)))
      setPromptH(h)
      setPanelW(w)
      // br keeps the left edge where it is; bl moves it with the pointer.
      setNudge({ key: anchor, z: zoom, dl: Math.round(corner === 'bl' ? from.dl + (ev.clientX - from.x) : from.dl) })
    }
    const up = () => {
      dragging.current = false
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (prompt.current) writeLocal(PROMPT_H, String(Math.round(prompt.current.offsetHeight)))
      if (panel.current) writeLocal(PROMPT_W, String(Math.round(panel.current.offsetWidth)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const resetSize = () => {
    setPromptH(0)
    setPanelW(0)
    setNudge(null)
    writeLocal(PROMPT_H, '')
    writeLocal(PROMPT_W, '')
  }
  // Switching tabs hands the current tab its references, prompt and single-slot material
  // back, then loads the target tab's own state — which is empty if it was never used.
  const switchMode = (to: ModeKey) => {
    const from = modeKey
    if (!video || !from || from === to) return
    const savedRefs = { ...modeRefs }
    const savedPrompts = { ...modePrompts }
    const savedScenes = { ...modeScenes }
    const savedExtras = { ...modeExtras }
    if (refs.length) savedRefs[from] = refs
    else delete savedRefs[from]
    savedExtras[from] = { lastFrame: last, motion, speech }
    if (from === 'story') savedScenes.story = scenes
    else if (p.prompt.trim()) savedPrompts[from] = p.prompt
    else delete savedPrompts[from]

    // A custom reference-to-video workflow only belongs to its own tab.
    let workflow = p.workflow
    if (to === 'refs') {
      const file = shape.meta.refsWorkflow as string | undefined
      const own = file ? refVideoFileOf(file) : null
      if (own && refVideoFilesAtom.get().includes(own)) workflow = file!
    } else if (refVideoFileOf(workflow)) {
      workflow = VIDEO_MODELS[0].id
    }
    const refsWorkflow = from === 'refs' && refVideoFileOf(p.workflow) ? p.workflow : shape.meta.refsWorkflow

    const extra = savedExtras[to] ?? {}
    setMeta({
      modeRefs: savedRefs,
      modePrompts: savedPrompts,
      modeScenes: savedScenes,
      modeExtras: savedExtras,
      refsWorkflow,
      refs: capRefs(savedRefs[to] ?? [], workflow),
      lastFrame: to === 'frames' ? extra.lastFrame ?? null : null,
      motion: to === 'motion' ? extra.motion ?? null : null,
      speech: to === 'lipsync' ? extra.speech ?? null : null,
      scenes: to === 'story' ? savedScenes.story ?? [{ prompt: savedPrompts.story ?? '', duration: p.duration }] : null,
      videoMode: to === 'story' ? null : to,
    })
    update({ prompt: savedPrompts[to] ?? '', workflow })
  }

  // Glued to the generator: it is centred under the shape and hangs GAP * scale below it,
  // recomputed every frame, so every camera move carries the panel along. A user-dragged
  // horizontal offset (nudge) is applied relative to the centre line and survives panning.
  // transform-origin 'top left' keeps the visual left/top edges on these exact values.
  // There is deliberately no clamp to the window: pinning the panel to an edge would make
  // it slide on its own while the canvas pans, unhooking it from the generator.
  // `scale` (not the raw camera zoom) is what the panel grows/shrinks by, so at the moment
  // it opens it is always full readable size regardless of how far the canvas is zoomed.
  const z = scale
  const center = (view!.l + view!.r) / 2
  const vw = (panelW || size.w) * z
  const left = nudged ? center + nudged.dl : center - vw / 2
  const top = view!.b + GAP * z
  const model = modelOf(media ? effectiveRefWorkflow(p.workflow) : p.workflow) ?? models[0]
  const available = modesFor(model)
  const modeFor = (src: string) => refModeFor(model, modes[src])?.id
  const used = usableRefs(model, refs, modes).map((r) => r.src)
  const unusedReason = (src: string) => available.length
    ? t('genPanel.refModeNotSupported', model.label, modeOf(modes[src]).label)
    : t('genPanel.refNotSupported', model.label)
  // Mentions reuse the numbers already drawn on the thumbnails, so "@图2" points at
  // whatever the badge calls 图2 — no second numbering scheme to keep in sync.
  const seen: Record<RefKind, number> = { image: 0, video: 0, audio: 0 }
  const mentions: Mention[] = refs.length
    ? refs.map((src): Mention => {
      const kind = refKind(src)
      const label = t(TAGS[kind], ++seen[kind])
      return { token: `@${label}`, label, caption: t(CAPTIONS[kind]), kind, src }
    })
    : used.map((src, i): Mention => {
      const label = t(TAGS.image, i + 1)
      return { token: `@${label}`, label, caption: modeOf(modeFor(src)).label, kind: 'image', src }
    })

  return (
    <div
      ref={panel}
      className="ca-gen"
      data-lan={lan || undefined}
      style={{
        left,
        top,
        ...(panelW ? { width: panelW } : {}),
        // The panel is part of the generator's world: it scales with the canvas.
        ...(z === 1 ? {} : { transform: `scale(${z})`, transformOrigin: 'top left' }),
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="ca-gen__refs" data-dense={refs.length >= 8 || undefined}>
        {refs.map((src) => (
          <span key={src} className="ca-gen__ref" data-off={video || used.includes(src) ? undefined : true} title={video || used.includes(src) ? undefined : unusedReason(src)}>
            <RefMedia src={src} />
            {!video && used.includes(src) && <span className="ca-gen__refnum">{used.indexOf(src) + 1}</span>}
            {media && <span className="ca-gen__refnum">{t(TAGS[refKind(src)], refs.filter((x) => refKind(x) === refKind(src)).indexOf(src) + 1)}</span>}
            <button type="button" title={t('common.remove')} onClick={() => setRefs(refs.filter((x) => x !== src))}>{Icons.close}</button>
            {!video && !available.length && <span className="ca-gen__refmode">{t('genPanel.refUnused')}</span>}
            {!video && available.length > 0 && (
              <Popover
                open={modeOpen === src}
                onOpenChange={(o) => setModeOpen(o ? src : null)}
                trigger={({ toggle }) => <span className="ca-gen__refmode" onClick={toggle}>{used.includes(src) ? modeOf(modeFor(src)).label : t('genPanel.refUnused')}</span>}
              >
                <div className="ca-menu ca-refmodes">
                  {[t('common.reference'), t('refModes.structure'), t('refModes.color')].map((group) => available.some((m) => m.group === group) && (
                    <div key={group}>
                      <div className="ca-gen__label">{group}</div>
                      {available.filter((m) => m.group === group).map((m) => (
                        <button key={m.id} type="button" className="ca-menu__item" onClick={() => setMeta({ refModes: { ...modes, [src]: m.id } })}>
                          <span className="ca-menu__grow">{m.label}{m.download && <span className="ca-model__tag">{t('genPanel.modelWillDownloadOnFirst')}</span>}</span>
                          {modeFor(src) === m.id && <span className="ca-icon">{Icons.check}</span>}
                        </button>
                      ))}
                    </div>
                  ))}
                  {model.control && modeOf(modeFor(src)).control && (
                    <>
                      <label className="ca-panel__row">
                        <span>{t('genPanel.referenceStrength')}</span>
                        <input type="range" min={10} max={150} value={strengths[src] ?? DEFAULT_STRENGTH} onChange={(e) => setMeta({ refStrengths: { ...strengths, [src]: Number(e.target.value) } })} />
                        <span className="ca-panel__val">{strengths[src] ?? DEFAULT_STRENGTH}</span>
                      </label>
                      <RefControls src={src} mode={modeOf(modeFor(src))} value={controls[src]} onChange={(c) => setMeta({ refControls: { ...controls, [src]: c } })} onError={onError} />
                    </>
                  )}
                </div>
              </Popover>
            )}
          </span>
        ))}
        {refs.length < maxRefs && (video || available.length > 0) && imagePicker('ref', media ? t('genPanel.addReference')
          : vmode === 'motion' ? t('genPanel.character')
            : vmode === 'lipsync' ? t('genPanel.portrait')
              : video ? t('genPanel.firstFrame') : t('genPanel.referenceImage'))}
        {media && <span className="ca-gen__slots">{t('genPanel.refSlots', slots.image, slots.video, slots.audio)}</span>}
        {!video && (
          <div className="ca-gen__colors">
            {colors.map((c, i) => (
              <span key={i} className="ca-gen__color">
                <ColorPicker value={c} title={t('genPanel.colorReference')} onChange={(v) => setColors(colors.map((x, j) => (j === i ? v : x)))} />
                <button type="button" title={t('common.remove')} onClick={() => setColors(colors.filter((_, j) => j !== i))}>{Icons.close}</button>
              </span>
            ))}
            <button type="button" className="ca-gen__refadd" title={t('genPanel.colorReference')} onClick={() => setColors([...colors, '#1E88E5'])}>
              <span className="ca-icon">{Icons.palette}</span><span>{t('genPanel.colorReference')}</span>
            </button>
          </div>
        )}
        {vmode === 'frames' && (last ? slot(last, t('genPanel.lastFrame'), () => setMeta({ lastFrame: null })) : imagePicker('last', t('genPanel.lastFrame')))}
        {vmode === 'motion' && (motion ? slot(motion, t('genPanel.motionVideo'), () => setMeta({ motion: null })) : imagePicker('motion', t('genPanel.motionVideo')))}
        {vmode === 'lipsync' && (speech ? slot(speech, t('genPanel.speechAudio'), () => setMeta({ speech: null })) : imagePicker('speech', t('genPanel.speechAudio')))}
        {!video && (base ? slot(base.src, t('genPanel.baseImage'), () => setMeta({ base: null })) : imagePicker('base', t('genPanel.baseImage')))}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files).catch((err) => onError(String(err))); e.target.value = '' }} />
      </div>
      {video && (
        <div className="ca-panel__chips ca-gen__modes">
          <button type="button" className="ca-panel__chip" data-on={vmode === 'frames' || undefined} onClick={() => switchMode('frames')}>{t('genPanel.firstLastFrame')}</button>
          <button type="button" className="ca-panel__chip" data-on={media || undefined} onClick={() => switchMode('refs')}>{t('genPanel.referenceToVideo')}</button>
          <button type="button" className="ca-panel__chip" data-on={vmode === 'motion' || undefined} onClick={() => switchMode('motion')}>{t('genPanel.motionControl')}</button>
          <button type="button" className="ca-panel__chip" data-on={vmode === 'lipsync' || undefined} onClick={() => switchMode('lipsync')}>{t('genPanel.lipSync')}</button>
          <button type="button" className="ca-panel__chip" data-on={story || undefined} onClick={() => switchMode('story')}>{t('genPanel.storyboard')}</button>
        </div>
      )}
      {base && !video && (
        <label className="ca-panel__row"><span>{t('genPanel.strength')}</span><input type="range" min={10} max={100} value={base.strength} onChange={(e) => setMeta({ strength: Number(e.target.value) })} /><span className="ca-panel__val">{base.strength}</span></label>
      )}
      {story ? <StoryboardEditor scenes={scenes} onChange={setScenes} onSmart={() => void smartSplit()} smartBusy={smart} mentions={mentions} /> : <MentionTextarea
        inputRef={prompt}
        className="ca-gen__prompt"
        height={shownH}
        value={p.prompt}
        mentions={mentions}
        placeholder={t('genPanel.whatDoYouWantTo')}
        onChange={(next) => update({ prompt: next })}
        onEnter={submit}
      />}
      <div className="ca-gen__foot">
        <SettingsPill p={p} video={video} quality={!!model.steps} update={update} />
        <AdvancedPill shape={shape} model={model} setMeta={setMeta} />
        <div className="ca-gen__spacer" />
        {lan && <RunOnPill runOn={validTarget(shape.meta.runOn)} onPick={(runOn) => setMeta({ runOn })} />}
        <ModelPill models={models} model={model} runOn={runOnOf(shape)} onPick={(id) => { if (media) setRefs(capRefs(refs, id)); update({ workflow: id }) }} />
        <button type="button" className="ca-gen__send" disabled={!ready} title={t('common.generate')} onClick={submit}>
          <span className="ca-icon">{Icons.send}</span>
        </button>
      </div>
      {/* The grips resize the prompt box, which the storyboard tab does not have. */}
      {!story && CORNERS.map((corner) => (
        <span
          key={corner}
          className="ca-gen__grip"
          data-corner={corner}
          title={t('genPanel.resizePrompt')}
          onPointerDown={(e) => grabResize(e, corner)}
          onDoubleClick={resetSize}
        />
      ))}
    </div>
  )
}
