import { titleTags, type PromptGraph } from './comfy'
import { t } from './i18n'

type Link = [string, number]

export type CustomAction = 'generate' | 'edit' | 'style' | 'inpaint' | 'expand' | 'upscale' | 'cutout' | 'erase' | 'angles' | 'layers' | 'video' | 'animate' | 'creativeUpscale' | 'refVideo' | 'motion' | 'lipsync' | 'extend' | 'videoUpscale' | 'videoCutout' | 'model3d' | 'views' | 'music' | 'speech' | 'clone' | 'sfx'
export type Marker = 'image' | 'image2' | 'image3' | 'image4' | 'image5' | 'image6' | 'image7' | 'image8' | 'image9' | 'base' | 'front' | 'left' | 'back' | 'right' | 'mask' | 'last' | 'video' | 'video2' | 'video3' | 'audio' | 'audio2' | 'audio3' | 'prompt' | 'lyrics' | 'size' | 'width' | 'height' | 'count' | 'seconds' | 'strength' | 'unet' | 'save'

export type CustomGroup = 'image' | 'edit' | 'tools' | 'video' | 'model' | 'audio'

interface ActionSpec { id: CustomAction; group: CustomGroup; required: Marker[]; optional: Marker[]; needsImages?: boolean; needsFrames?: boolean; refsOptional?: boolean; note: string }

export const CUSTOM_ACTIONS: ActionSpec[] = [
  { id: 'generate', group: 'image', required: ['prompt', 'size'], optional: ['count', 'unet', 'image', 'image2', 'base', 'strength'], note: 'Text to image. Shows up as an extra model in the image generator. @image and @image2 receive the first two reference images; a workflow with @image needs a reference to run, and @image2 gets the first one when only one is given. @base receives the base image and @strength its strength from 0.1 to 1 (for example a denoise input). A base image given to a workflow with no @base is an error. Transparent output is added by ComfyArt after @save, so @save needs an images input. LoRAs picked under Advanced need @unet.' },
  { id: 'edit', group: 'edit', required: ['image', 'prompt'], optional: [], note: 'Instruction edit: quick edit, edit text, compose and mockup blending. @prompt receives the edit instruction.' },
  { id: 'style', group: 'edit', required: ['image', 'prompt'], optional: ['image2'], note: 'Style transfer. @image2 is the style reference; without one ComfyArt passes the source image again. A reference given to a workflow with no @image2 is an error.' },
  { id: 'inpaint', group: 'edit', required: ['image', 'prompt'], optional: [], needsImages: true, note: 'Edit a region. @image receives the cropped region; ComfyArt pastes the result back into the full image, so @save needs an images input.' },
  { id: 'expand', group: 'edit', required: ['image', 'mask', 'prompt'], optional: [], note: 'Outpaint. ComfyArt pads the image itself: @image receives the padded image and @mask the new area (white = fill).' },
  { id: 'angles', group: 'edit', required: ['image', 'prompt'], optional: [], note: '@prompt receives a camera description such as "<qma> front-right quarter view eye-level shot medium shot".' },
  { id: 'upscale', group: 'tools', required: ['image'], optional: [], needsImages: true, note: 'ComfyArt resizes the result to the factor the user picked, so @save needs an images input.' },
  { id: 'creativeUpscale', group: 'tools', required: ['image', 'prompt'], optional: ['strength'], needsImages: true, note: 'Upscale with added detail. @image receives the source at its own size, @prompt the detail description and @strength the amount of change from 0 to 1. ComfyArt resizes the result to the factor the user picked, so @save needs an images input.' },
  { id: 'cutout', group: 'tools', required: ['image'], optional: [], note: 'Background removal. The result should keep an alpha channel.' },
  { id: 'erase', group: 'tools', required: ['image', 'mask'], optional: [], note: 'Object removal, also used to fill the background behind edited elements, split layers and moved objects. For move object ComfyArt grows the mask and pastes the object at its new place, so @save needs an images input there. @mask is the area to remove (white = remove).' },
  { id: 'layers', group: 'tools', required: ['image'], optional: ['prompt', 'count'], note: '@count receives the number of layers. The result is several RGBA images.' },
  { id: 'video', group: 'video', required: ['prompt', 'size'], optional: ['image', 'last', 'seconds'], note: 'Replaces the built-in model in the video generator\'s first/last frame mode and in the storyboard. A first or last frame given to a workflow without @image / @last is an error. In a storyboard each scene runs the workflow once and the clips are joined, so @save needs a video input. With @image, each scene starts from the last frame of the one before and the first scene needs a first frame; without @image the scenes are independent.' },
  { id: 'animate', group: 'video', required: ['image', 'prompt'], optional: ['size', 'seconds', 'last'], note: 'Animate an image into a short clip. With loop on, @last receives the source image again so the clip ends where it starts.' },
  { id: 'refVideo', group: 'video', required: ['prompt'], optional: ['image', 'image2', 'image3', 'image4', 'image5', 'image6', 'image7', 'image8', 'image9', 'video', 'video2', 'video3', 'audio', 'audio2', 'audio3', 'size', 'seconds'], refsOptional: true, note: 'Reference to video. Takes up to nine images, three videos and three audios, each on its own marker (@image, @image2 ... @image9; @video, @video2, @video3; @audio, @audio2, @audio3); @prompt receives the text as written. At least one reference of any kind is needed to run; every marker left without a reference is skipped and its loader is dropped from the graph, so a workflow may offer more slots than the user fills. A reference given to a workflow with no matching marker is an error.' },
  { id: 'motion', group: 'video', required: ['image', 'video', 'prompt'], optional: ['size', 'seconds'], note: 'Motion control. @image receives the character and @video the motion video.' },
  { id: 'lipsync', group: 'video', required: ['image', 'audio', 'prompt'], optional: ['size', 'seconds'], note: 'Lip sync. @image receives the portrait and @audio the speech. @seconds receives the length of the audio.' },
  { id: 'extend', group: 'video', required: ['video', 'prompt'], optional: ['seconds'], note: 'Extend a video. @video receives the source and @seconds the length to add. The result is placed as a new video, so it should hold the original plus the new part.' },
  { id: 'videoUpscale', group: 'video', required: ['video'], optional: [], needsFrames: true, note: 'ComfyArt resizes the result to the size the user picked, so @save needs a video or images input.' },
  { id: 'videoCutout', group: 'video', required: ['video'], optional: [], note: 'Video background removal.' },
  { id: 'model3d', group: 'model', required: ['image'], optional: [], note: 'Image to 3D. Shows up as an extra model in the image toolbar\'s 3D menu. The result must be a GLB file, e.g. from SaveGLB.' },
  { id: 'views', group: 'model', required: ['front'], optional: ['left', 'back', 'right'], note: 'Multi-view to 3D. Replaces the built-in model. The selected images go to @front, @left, @back and @right in that order. The number of selected images must match the markers. The result must be a GLB file.' },
  { id: 'music', group: 'audio', required: ['prompt'], optional: ['lyrics', 'seconds'], note: 'Text to music. Shows up as an extra model in the audio dialog. @prompt receives the style. Empty lyrics are sent as [instrumental]; lyrics given to a workflow with no @lyrics are an error. Without @seconds the workflow keeps its own length. When several nodes need the same text or length (YuE2 ABC and music nodes, ACE-Step encoder and latent), link them to one String or Float node and mark that node.' },
  { id: 'speech', group: 'audio', required: ['prompt'], optional: [], note: 'Voiceover. Replaces the built-in model when no recording is cloned. @prompt receives the text to read. The workflow picks its own voice, so the voice setting is not passed.' },
  { id: 'clone', group: 'audio', required: ['audio', 'prompt'], optional: [], note: 'Voice clone. @audio receives the selected recording and @prompt the text to read.' },
  { id: 'sfx', group: 'audio', required: ['prompt'], optional: ['seconds'], note: 'Sound effect. Replaces the built-in model. @prompt receives the description. Without @seconds the workflow keeps its own length.' },
]

export const MARKERS: { id: Marker; fill: string }[] = [
  { id: 'image', fill: 'Load Image (LoadImage or LoadImageMask): the input image' },
  { id: 'image2', fill: 'Load Image: a second image' },
  { id: 'image3', fill: 'Load Image: a third image' },
  { id: 'image4', fill: 'Load Image: a fourth image' },
  { id: 'image5', fill: 'Load Image: a fifth image' },
  { id: 'image6', fill: 'Load Image: a sixth image' },
  { id: 'image7', fill: 'Load Image: a seventh image' },
  { id: 'image8', fill: 'Load Image: an eighth image' },
  { id: 'image9', fill: 'Load Image: a ninth image' },
  { id: 'base', fill: 'Load Image: the base image of an image-to-image run' },
  { id: 'front', fill: 'Load Image: the front view of an object' },
  { id: 'left', fill: 'Load Image: the left view of an object' },
  { id: 'back', fill: 'Load Image: the back view of an object' },
  { id: 'right', fill: 'Load Image: the right view of an object' },
  { id: 'mask', fill: 'LoadImageMask (channel is set to alpha) or LoadImage (use its MASK output): white = area to change' },
  { id: 'last', fill: 'Load Image: the last frame of a video' },
  { id: 'video', fill: 'Load Video: the input video' },
  { id: 'video2', fill: 'Load Video: a second video' },
  { id: 'video3', fill: 'Load Video: a third video' },
  { id: 'audio', fill: 'Load Audio: the input recording' },
  { id: 'audio2', fill: 'Load Audio: a second recording' },
  { id: 'audio3', fill: 'Load Audio: a third recording' },
  { id: 'prompt', fill: 'a node holding the text as a widget, e.g. CLIPTextEncode (text), TextEncodeQwenImageEdit (prompt), String (Multiline) (value)' },
  { id: 'lyrics', fill: 'a node holding the lyrics as a widget, e.g. YuE2GenerateMusic or MiniMaxMusic3TextEncode (lyrics), String (Multiline) (value)' },
  { id: 'size', fill: 'a node with width and height widgets, e.g. EmptyLatentImage; its batch_size also gets the image count when there is no @count' },
  { id: 'width', fill: 'an Int node or any node with a width widget' },
  { id: 'height', fill: 'an Int node or any node with a height widget' },
  { id: 'count', fill: 'an Int node or a node with batch_size / amount: how many results' },
  { id: 'seconds', fill: 'an Int or Float node or a node with seconds / duration / max_duration: video or audio length in seconds (not frames)' },
  { id: 'strength', fill: 'a Float node or a node with denoise / strength: how much the base image changes, from 0.1 to 1' },
  { id: 'unet', fill: 'the node whose first output is the MODEL, e.g. Load Diffusion Model or Load Checkpoint: LoRAs picked under Advanced are chained after it' },
  { id: 'save', fill: 'the output node (Save Image, Save Video, Preview Image...). Needed only when the workflow has more than one end node' },
]

const LOADERS = ['LoadImage', 'LoadImageMask']
const IMAGE_MARKERS: Marker[] = ['image', 'image2', 'image3', 'image4', 'image5', 'image6', 'image7', 'image8', 'image9', 'base', 'front', 'left', 'back', 'right', 'mask', 'last']
export const REF_MARKERS: Record<'image' | 'video' | 'audio', Marker[]> = {
  image: ['image', 'image2', 'image3', 'image4', 'image5', 'image6', 'image7', 'image8', 'image9'],
  video: ['video', 'video2', 'video3'],
  audio: ['audio', 'audio2', 'audio3'],
}
const TEXT_KEYS = ['text', 'prompt', 'value', 'string', 'tags', 'caption', 'style', 'target_text']
const LYRICS_KEYS = ['lyrics', 'value', 'text', 'string']
const NUMBER_KEYS: Partial<Record<Marker, string[]>> = {
  width: ['value', 'width'], height: ['value', 'height'], count: ['value', 'batch_size', 'amount'], seconds: ['value', 'seconds', 'duration', 'max_duration'], strength: ['value', 'denoise', 'strength'],
}
export const NO_LYRICS = '[instrumental]'

export type Markers = Partial<Record<Marker, string>>

export const specOf = (action: CustomAction) => CUSTOM_ACTIONS.find((a) => a.id === action)!
const label = (graph: PromptGraph, id: string) => `${id} (${graph[id].class_type})`

export function parseApiWorkflow(text: string): PromptGraph {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(t('customWorkflows.notJson'))
  }
  return asApiWorkflow(data)
}

export function asApiWorkflow(data: unknown): PromptGraph {
  if (!data || typeof data !== 'object' || Array.isArray(data) || 'nodes' in data) throw new Error(t('customWorkflows.notApiFormat'))
  const nodes = Object.values(data as Record<string, unknown>)
  if (!nodes.length || !nodes.every((n) => n && typeof n === 'object' && 'class_type' in n && 'inputs' in n)) throw new Error(t('customWorkflows.notApiFormat'))
  return data as PromptGraph
}

export function findMarkers(graph: PromptGraph): Markers {
  const found: Markers = {}
  for (const [id, node] of Object.entries(graph) as [string, PromptGraph[string]][]) {
    for (const tag of titleTags(node)) {
      const marker = MARKERS.find((m) => tag === `@${m.id}`)?.id
      if (marker && !found[marker]) found[marker] = id
    }
  }
  return found
}

function sinkOf(graph: PromptGraph): string | null {
  const used = new Set<string>()
  for (const node of Object.values(graph)) for (const v of Object.values(node.inputs)) if (Array.isArray(v) && typeof v[0] === 'string') used.add(v[0])
  const sinks = Object.keys(graph).filter((id) => !used.has(id))
  return sinks.length === 1 ? sinks[0] : null
}

export const outputOf = (graph: PromptGraph, markers: Markers) => markers.save ?? sinkOf(graph)

function textKey(node: PromptGraph[string], names = TEXT_KEYS): string | null {
  const keys = Object.keys(node.inputs).filter((k) => typeof node.inputs[k] === 'string')
  return names.find((k) => keys.includes(k)) ?? (keys.length === 1 ? keys[0] : null)
}

function numberKey(node: PromptGraph[string], marker: Marker): string | null {
  const keys = Object.keys(node.inputs).filter((k) => typeof node.inputs[k] === 'number')
  return (NUMBER_KEYS[marker] ?? []).find((k) => keys.includes(k)) ?? null
}

function fillProblem(graph: PromptGraph, id: string, marker: Marker): string | null {
  const node = graph[id]
  if (IMAGE_MARKERS.includes(marker)) return LOADERS.includes(node.class_type) ? null : t('customWorkflows.needsLoader', `@${marker}`, label(graph, id))
  if (marker.startsWith('video')) return node.class_type === 'LoadVideo' ? null : t('customWorkflows.needsVideoLoader', label(graph, id))
  if (marker.startsWith('audio')) return node.class_type === 'LoadAudio' ? null : t('customWorkflows.needsAudioLoader', label(graph, id))
  if (marker === 'prompt') return textKey(node) ? null : t('customWorkflows.noTextWidget', label(graph, id))
  if (marker === 'lyrics') return textKey(node, LYRICS_KEYS) ? null : t('customWorkflows.noTextWidget', label(graph, id))
  if (marker === 'size') return ['width', 'height'].every((k) => typeof node.inputs[k] === 'number') ? null : t('customWorkflows.noSizeWidgets', label(graph, id))
  if (marker === 'save' || marker === 'unet') return null
  return numberKey(node, marker) ? null : t('customWorkflows.noNumberWidget', `@${marker}`, label(graph, id))
}

export interface Check { markers: Markers; errors: string[]; warnings: string[] }

export function checkWorkflow(graph: PromptGraph, action: CustomAction): Check {
  const spec = specOf(action)
  const markers = findMarkers(graph)
  const errors: string[] = []
  const warnings: string[] = []
  const has = (m: Marker) => !!markers[m] || (m === 'size' && !!markers.width && !!markers.height)
  const missing = spec.required.filter((m) => !has(m))
  if (missing.length) errors.push(t('customWorkflows.missingMarkers', missing.map((m) => (m === 'size' ? '@size (or @width + @height)' : `@${m}`)).join(', ')))
  const titles = new Map<string, string[]>()
  for (const [id, node] of Object.entries(graph) as [string, PromptGraph[string]][]) {
    for (const tag of titleTags(node)) titles.set(tag, [...(titles.get(tag) ?? []), id])
  }
  const usable: Marker[] = [...spec.required, ...spec.optional, 'save', ...(spec.required.includes('size') || spec.optional.includes('size') ? ['width', 'height'] as Marker[] : [])]
  for (const [title, ids] of titles) {
    const marker = MARKERS.find((m) => `@${m.id}` === title)?.id
    if (ids.length > 1) errors.push(t('customWorkflows.duplicateMarker', title, ids.join(', ')))
    if (!marker) warnings.push(t('customWorkflows.unknownMarker', title, ids[0]))
    else if (!usable.includes(marker)) warnings.push(t('customWorkflows.unusedMarker', title, t(`customWorkflows.action.${action}`)))
  }
  for (const [marker, id] of Object.entries(markers) as [Marker, string][]) {
    if (!usable.includes(marker)) continue
    const problem = fillProblem(graph, id, marker)
    if (problem) errors.push(problem)
  }
  const out = outputOf(graph, markers)
  if (!out) errors.push(t('customWorkflows.noOutput'))
  else if (spec.needsImages && !Array.isArray(graph[out].inputs.images)) errors.push(t('customWorkflows.outputNeedsImages', label(graph, out)))
  else if (spec.needsFrames && !Array.isArray(graph[out].inputs.images) && !Array.isArray(graph[out].inputs.video)) errors.push(t('customWorkflows.outputNeedsFrames', label(graph, out)))
  return { markers, errors, warnings }
}

export interface RefLists { image?: string[]; video?: string[]; audio?: string[] }

export interface CustomValues { image?: string; image2?: string; image3?: string; image4?: string; image5?: string; image6?: string; image7?: string; image8?: string; image9?: string; base?: string; front?: string; left?: string; back?: string; right?: string; strength?: number; mask?: string; last?: string; video?: string; video2?: string; video3?: string; audio?: string; audio2?: string; audio3?: string; prompt?: string; lyrics?: string; width?: number; height?: number; count?: number; seconds?: number; refs?: RefLists }

export const filledRefs = (values: CustomValues) => (['image', 'video', 'audio'] as const).flatMap((kind) => REF_MARKERS[kind]).filter((m) => !!(values as Record<string, unknown>)[m])


const REF_GROUP = { image: 'ref_images.ref_image_', video: 'ref_videos.ref_video_', vaudio: 'ref_video_audios.ref_video_audio_', audio: 'ref_audios.ref_audio_' }

function refIndexOf(marker: string, kind: 'image' | 'video' | 'audio') {
  if (marker === kind) return 0
  const n = Number(marker.slice(kind.length))
  return Number.isInteger(n) && n > 1 ? n - 1 : -1
}

/** 参考生视频的模型（H3 这类）把参考放在 ref_images. / ref_videos. / ref_audios. 三组可选输入里。
 *  工作流为了让「不填视频音频也能跑」把这些线摘掉了，所以填了参考之后这里负责接回去。
 *  已经连好的不动，节点不吃这组输入的直接跳过。 */
function wireRefs(graph: PromptGraph, markers: Markers, values: CustomValues) {
  const target = Object.values(graph).find((node) => Object.keys(node.inputs).some((k) => k.startsWith(REF_GROUP.image)))
  if (!target) return
  const wired = (key: string) => Array.isArray(target.inputs[key])
  const splitterOf = (id: string) =>
    Object.entries(graph).find(([, node]) => node.class_type === 'GetVideoComponents' && Array.isArray(node.inputs.video) && (node.inputs.video as unknown[])[0] === id)?.[0]
  for (const kind of ['image', 'video', 'audio'] as const) {
    for (const marker of REF_MARKERS[kind]) {
      const id = markers[marker]
      if (!id || !graph[id] || !(values as Record<string, unknown>)[marker]) continue
      const index = refIndexOf(marker, kind)
      if (index < 0) continue
      if (kind === 'video') {
        const split = splitterOf(id)
        if (!wired(REF_GROUP.video + index)) target.inputs[REF_GROUP.video + index] = [split ?? id, 0] as Link
        if (split && !wired(REF_GROUP.vaudio + index)) target.inputs[REF_GROUP.vaudio + index] = [split, 1] as Link
      } else if (!wired(REF_GROUP[kind] + index)) {
        target.inputs[REF_GROUP[kind] + index] = [id, 0] as Link
      }
    }
  }
}

function dropUnfilledRefs(graph: PromptGraph, markers: Markers, values: CustomValues) {
  const dropped = new Set<string>()
  for (const kind of ['image', 'video', 'audio'] as const) {
    for (const m of REF_MARKERS[kind]) {
      const id = markers[m]
      if (id && graph[id] && !(values as Record<string, unknown>)[m]) dropped.add(id)
    }
  }
  if (!dropped.size) return
  const root = outputOf(graph, markers)
  const tainted = new Set(dropped)
  for (let changed = true; changed; ) {
    changed = false
    for (const [id, node] of Object.entries(graph)) {
      if (tainted.has(id) || id === root) continue
      const parents = Object.values(node.inputs).filter((v): v is Link => Array.isArray(v) && typeof v[0] === 'string').map((v) => v[0])
      if (parents.length && parents.every((p) => tainted.has(p))) {
        tainted.add(id)
        changed = true
      }
    }
  }
  for (const node of Object.values(graph)) {
    for (const [k, v] of Object.entries(node.inputs)) {
      if (Array.isArray(v) && typeof v[0] === 'string' && tainted.has(v[0])) delete node.inputs[k]
    }
  }
  if (!root) return
  const keep = new Set<string>()
  const walk = (id: string) => {
    if (keep.has(id) || !graph[id]) return
    keep.add(id)
    for (const v of Object.values(graph[id].inputs)) if (Array.isArray(v) && typeof v[0] === 'string') walk(v[0])
  }
  walk(root)
  for (const id of Object.keys(graph)) if (!keep.has(id)) delete graph[id]
}

export function fillWorkflow(graph: PromptGraph, markers: Markers, values: CustomValues) {
  for (const [marker, id] of Object.entries(markers) as [Marker, string][]) {
    const value = marker === 'size' || marker === 'save' || marker === 'unet' ? undefined : values[marker]
    if (value === undefined) continue
    const node = graph[id]
    if (IMAGE_MARKERS.includes(marker)) {
      node.inputs.image = value
      if (node.class_type === 'LoadImageMask') node.inputs.channel = 'alpha'
    } else if (marker.startsWith('video')) node.inputs.file = value
    else if (marker.startsWith('audio')) node.inputs.audio = value
    else if (marker === 'lyrics') node.inputs[textKey(node, LYRICS_KEYS)!] = value || NO_LYRICS
    else node.inputs[marker === 'prompt' ? textKey(node)! : numberKey(node, marker)!] = value
  }
  if (markers.size && values.width && values.height) {
    const size = graph[markers.size].inputs
    Object.assign(size, { width: values.width, height: values.height })
    if (values.count && typeof size.batch_size === 'number' && !markers.count) size.batch_size = values.count
  }
  wireRefs(graph, markers, values)
  dropUnfilledRefs(graph, markers, values)
  for (const node of Object.values(graph)) {
    for (const k of ['seed', 'noise_seed']) if (typeof node.inputs[k] === 'number') node.inputs[k] = Math.floor(Math.random() * 2 ** 31)
  }
}

export function rulesText(): string {
  const markers = MARKERS.map((m) => `- @${m.id}: ${m.fill}`).join('\n')
  const actions = CUSTOM_ACTIONS.map((a) => `- ${a.id}: needs ${a.required.map((m) => `@${m}`).join(', ')}${a.optional.length ? `; optional ${a.optional.map((m) => `@${m}`).join(', ')}` : ''}. ${a.note}`).join('\n')
  return [
    'Connect a user\'s own ComfyUI workflow to a ComfyArt feature. ComfyArt finds the nodes to fill by their title (_meta.title in API format), so the job is to title the right nodes and install the workflow.',
    'Steps:\n1. The workflow must be API format (Workflow > Export (API) in ComfyUI): an object of node id -> {class_type, inputs, _meta}. A UI-format file (with "nodes" and "links") cannot be used; ask the user to export it as API.\n2. Pick the feature (action) and set _meta.title of the nodes listed for it below. Titles are case-insensitive. Each marker goes on exactly one node; a node that receives several values carries several markers separated by spaces, e.g. "@prompt @size". Other words in the title are ignored, so "Positive @prompt" works. Only change _meta.title and, when a value has no node to receive it, add the smallest node that can (for example a PrimitiveInt for @seconds feeding a frame-count input through a math node). Do not change the user\'s models or settings.\n3. Call custom_workflow with action check, the workflow and the feature; fix every error it reports.\n4. Call custom_workflow with action install, a short name, the workflow and the feature. It saves the file to comfyart/workflows/<feature>/ in the ComfyUI user folder and assigns it to that feature. There is no delete: to remove a workflow, the user deletes its file there.\n5. Tell the user which feature now uses it; assign with file "" switches back to built in.',
    `Markers (the node title is @ plus the name):\n${markers}`,
    `Features:\n${actions}`,
    'ComfyArt randomizes every seed and noise_seed input on each run and maps model file names to the subfolder they are in, so seeds and model paths need no marker. The workflows ComfyArt ships (custom_nodes/ComfyArt/workflows/*.api.json) carry the same titles and are good examples; other @ names in them (besides @unet) are internal and ignored for custom workflows.',
  ].join('\n\n')
}
