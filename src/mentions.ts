import type { RefKind } from './comfy'

// A mention is a pointer to a reference already attached to the generator.
// `token` is the literal text kept inside the prompt (so the textarea stays a plain
// string and undo/redo keeps working); the highlight around it is purely visual.
export type Mention = {
  token: string
  label: string
  caption: string
  kind: RefKind
  src: string
}

// The same reference gets written in several ways: the picker inserts "@图1", a
// prompt copied out of another tool may say "@图片1" or "@Image 1". They all point at
// the same chip, so recognition must not depend on the author's spelling.
const WORDS: Record<RefKind, string[]> = {
  image: ['图片', '图像', '图', 'Image', 'image'],
  video: ['视频', 'Video', 'video'],
  audio: ['音频', 'Audio', 'audio'],
}

const numberOf = (token: string) => token.match(/(\d+)$/)?.[1] ?? null

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Every spelling that resolves to a mention, keyed by the text it matches.
function forms(mentions: Mention[]): Map<string, Mention> {
  const map = new Map<string, Mention>()
  for (const m of mentions) {
    map.set(m.token, m)
    const n = numberOf(m.token)
    if (!n) continue
    for (const word of WORDS[m.kind]) {
      map.set(`@${word}${n}`, m)
      map.set(`@${word} ${n}`, m)
    }
  }
  return map
}

// The marker is an authoring aid, not something the model should read. Before the
// prompt reaches a workflow we drop the `@` and keep the plain words (图1 / Image 1),
// which still tells the model which reference is meant without leaking markup.
const TOKEN = /@(图片|图像|图|视频|音频|image|video|audio)( ?)(\d+)/gi

export function stripMentions(text: string): string {
  return text.replace(TOKEN, (_m, word: string, space: string, n: string) => `${word}${space}${n}`)
}

// Highlight only tokens that still point at an attached reference; a mention whose
// reference was removed degrades to plain text instead of pretending to be valid.
export function mentionRe(mentions: Mention[]): RegExp | null {
  const map = forms(mentions)
  if (!map.size) return null
  const alts = [...map.keys()].sort((a, b) => b.length - a.length).map(escapeRe)
  return new RegExp(`(${alts.join('|')})(?![0-9])`, 'g')
}

// Splits the prompt into plain runs and mention runs, so the editor can render the
// mentions as chips while keeping the string itself untouched. `text` keeps the
// exact spelling that was found, so serialising the editor never rewrites the prompt.
export function splitMentions(text: string, mentions: Mention[]): { text: string; mention?: Mention }[] {
  const re = mentionRe(mentions)
  if (!re) return text ? [{ text }] : []
  const map = forms(mentions)
  const out: { text: string; mention?: Mention }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at) })
    out.push({ text: m[0], mention: map.get(m[0]) })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
