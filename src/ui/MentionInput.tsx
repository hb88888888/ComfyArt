import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { thumbUrl } from '../comfy'
import { t } from '../i18n'
import { splitMentions, type Mention } from '../mentions'
import { Icons } from './icons'
import { isEnter } from './keys'

const EDGE = 8
const MAX_QUERY = 18
const CHIP = 'ca-ment__chip'
// Only a doubled @@ is ignored — a mention may follow any character, Chinese or
// Latin ("是肥头强@图1", "a man@图1"), and closing the list is one Escape away.
const NO_GLUE = /^[\s，。、；：！？,.;:!?）)】\]]/
const ALIAS: Record<string, string> = { image: '图片image', video: '视频video', audio: '音频audio' }

// Position of the `@` the caret sits behind, plus whatever has been typed after it.
function activeQuery(value: string, caret: number): { start: number; query: string } | null {
  if (caret < 1) return null
  const at = value.lastIndexOf('@', caret - 1)
  if (at < 0) return null
  const query = value.slice(at + 1, caret)
  if (query.length > MAX_QUERY || /[\s\n]/.test(query)) return null
  if (at > 0 && value[at - 1] === '@') return null
  return { start: at, query }
}

// A chip carries the token as its text, so the editor serialises back to the very
// same string the prompt used before — history, undo and stripping stay unchanged.
function chipNode(doc: Document, m: Mention, token = m.token): HTMLElement {
  const chip = doc.createElement('span')
  chip.className = CHIP
  chip.setAttribute('contenteditable', 'false')
  chip.dataset.kind = m.kind
  chip.dataset.token = token
  const thumb = doc.createElement('span')
  thumb.className = 'ca-ment__chipimg'
  if (m.kind === 'audio') thumb.dataset.glyph = '\u266a'
  else thumb.style.backgroundImage = `url("${thumbUrl(m.src, 128)}")`
  const label = doc.createElement('span')
  label.className = 'ca-ment__chiplabel'
  label.textContent = token
  chip.append(thumb, label)
  return chip
}

// Reads the editor back into a plain prompt string. Chips are serialised from
// their token, so nothing painted inside them (thumbnails, glyphs) can leak.
function nodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.dataset.token) return el.dataset.token
  if (el.tagName === 'BR') return '\n'
  let out = ''
  el.childNodes.forEach((child) => { out += nodeText(child) })
  return out
}

function serialize(root: HTMLElement): string {
  let out = ''
  root.childNodes.forEach((node) => { out += nodeText(node) })
  return out
}

function paint(root: HTMLElement, value: string, mentions: Mention[]) {
  const doc = root.ownerDocument
  const frag = doc.createDocumentFragment()
  for (const part of splitMentions(value, mentions)) {
    if (part.mention) frag.append(chipNode(doc, part.mention, part.text))
    else if (part.text) frag.append(doc.createTextNode(part.text))
  }
  root.replaceChildren(frag)
  root.toggleAttribute('data-empty', !value.trim())
}

// Everything the painted DOM stands for: the string plus the references behind each
// token. Pasted text is painted once more by hand, so it needs the same signature.
const sigOf = (value: string, mentions: Mention[]) => `${value}\u0000${mentions.map((m) => m.token).join('\u0001')}`

function caretOffset(root: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 0
  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) return 0
  const probe = root.ownerDocument.createRange()
  probe.selectNodeContents(root)
  probe.setEnd(range.startContainer, range.startOffset)
  return probe.toString().length
}

function pointAt(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let left = offset
  let last: Text | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    last = node
    if (left <= node.data.length) return { node, offset: left }
    left -= node.data.length
  }
  if (last) return { node: last, offset: last.data.length }
  return { node: root, offset: 0 }
}

function setCaret(root: HTMLElement, offset: number) {
  const sel = window.getSelection()
  if (!sel) return
  const at = pointAt(root, offset)
  const range = root.ownerDocument.createRange()
  const chip = (at.node.parentElement as HTMLElement | null)?.closest(`.${CHIP}`)
  if (chip && root.contains(chip)) range.setStartAfter(chip)
  else range.setStart(at.node, at.offset)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

function Thumb({ mention }: { mention: Mention }) {
  // The server renders a poster frame for videos too, so one path covers both.
  if (mention.kind === 'audio') return <span className="ca-icon">{Icons.music}</span>
  return <img src={thumbUrl(mention.src, 128)} alt="" />
}

export function MentionTextarea({ value, onChange, mentions, className, placeholder, inputRef, onEnter, height }: {
  value: string
  onChange: (next: string) => void
  mentions: Mention[]
  className?: string
  placeholder?: string
  inputRef?: RefObject<HTMLDivElement | null>
  onEnter?: () => void
  /** Fixed pixel height for a box the panel lets the user drag; 0/undefined = auto. */
  height?: number
}) {
  const el = useRef<HTMLDivElement | null>(null)
  const popEl = useRef<HTMLDivElement>(null)
  const [pop, setPop] = useState<{ start: number; query: string } | null>(null)
  const [cursor, setCursor] = useState(0)
  const latest = useRef(value)
  const painted = useRef('')
  const composing = useRef(false)

  latest.current = value

  const query = pop?.query.trim().toLowerCase() ?? ''
  const items = pop ? mentions.filter((m) => !query || m.label.toLowerCase().includes(query) || ALIAS[m.kind].includes(query)) : []
  const index = items.length ? Math.min(cursor, items.length - 1) : 0

  // The editor owns its own DOM. It is only rebuilt when the value or the set of
  // attached references changes from the outside — never on the keystrokes that
  // produced that value, otherwise the caret (and any IME composition) would die.
  useLayoutEffect(() => {
    const root = el.current
    if (!root) return
    const sig = sigOf(value, mentions)
    if (serialize(root) === value && sig === painted.current) return
    const caret = root.contains(document.activeElement) || document.activeElement === root ? caretOffset(root) : null
    paint(root, value, mentions)
    painted.current = sig
    if (caret != null) setCaret(root, Math.min(caret, value.length))
  }, [value, mentions])

  // Reads the DOM back into the prompt string. Chips contribute their token text.
  const emit = () => {
    const root = el.current
    if (!root) return ''
    // Chromium keeps a stray <br> (or an empty text node) behind when everything is
    // deleted; a whitespace-only prompt must read as empty or the placeholder hides.
    const raw = serialize(root)
    const text = raw.trim() ? raw : ''
    root.toggleAttribute('data-empty', text === '')
    if (text !== latest.current) {
      latest.current = text
      onChange(text)
    }
    return text
  }

  const refresh = (withPop = true) => {
    const root = el.current
    if (!root) return
    const text = emit()
    setPop(withPop && !composing.current ? activeQuery(text, caretOffset(root)) : null)
    setCursor(0)
  }

  const pick = (m: Mention) => {
    const root = el.current
    if (!root || !pop) return
    const doc = root.ownerDocument
    const caret = caretOffset(root)
    const tail = serialize(root).slice(caret)
    const glue = NO_GLUE.test(tail) ? '' : ' '
    const from = pointAt(root, pop.start)
    const to = pointAt(root, caret)
    const range = doc.createRange()
    range.setStart(from.node, from.offset)
    range.setEnd(to.node, to.offset)
    range.deleteContents()
    const frag = doc.createDocumentFragment()
    frag.append(chipNode(doc, m))
    if (glue) frag.append(doc.createTextNode(glue))
    range.insertNode(frag)
    setPop(null)
    root.focus()
    setCaret(root, pop.start + m.token.length + glue.length)
    emit()
  }

  // Structural edits (newline, paste) bypass the browser so the DOM never grows
  // block elements the serializer cannot read back.
  const insertText = (text: string, withPop = true) => {
    const root = el.current
    if (!root) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    if (!root.contains(range.startContainer)) return
    range.deleteContents()
    const node = root.ownerDocument.createTextNode(text)
    range.insertNode(node)
    const after = root.ownerDocument.createRange()
    after.setStart(node, node.data.length)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
    refresh(withPop && !text.includes('\n'))
  }

  // Pasted prompts usually come from somewhere else and already spell the references
  // out ("@图1", "@图片2", "@Image 1"). They are inserted as plain text — the DOM is
  // then repainted by hand so every recognised token turns into a chip straight away
  // (the layout effect cannot do it: the string already matches what it reads back).
  const paste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
    const root = el.current
    if (!text || !root) return
    insertText(text, false)
    const next = serialize(root)
    const caret = caretOffset(root)
    paint(root, next, mentions)
    painted.current = sigOf(next, mentions)
    setCaret(root, Math.min(caret, next.length))
  }

  // While the list is open it owns the keyboard. tldraw listens for keys on the
  // document in the capture phase, so these are taken on window capture first —
  // otherwise Escape would deselect the generator and the arrows would nudge shapes.
  const keys = useRef({ move: (_d: number) => {}, pick: () => {}, close: () => {} })
  useLayoutEffect(() => {
    keys.current = {
      move: (d: number) => setCursor((c) => (items.length ? (c + d + items.length) % items.length : 0)),
      pick: () => { if (items.length) pick(items[index]) },
      close: () => setPop(null),
    }
  })
  useEffect(() => {
    if (!pop) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      const k = e.key
      if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Enter' && k !== 'Tab' && k !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (k === 'ArrowDown') keys.current.move(1)
      else if (k === 'ArrowUp') keys.current.move(-1)
      else if (k === 'Escape') keys.current.close()
      else keys.current.pick()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pop])

  // Anchor the list under the `@` once it exists in the DOM, before paint — and once
  // more on the next frame, in case the list grew after its first measurement.
  useLayoutEffect(() => {
    const root = el.current
    const panel = popEl.current
    if (!pop || !root || !panel) return
    const place = () => {
      const at = pointAt(root, pop.start)
      const range = root.ownerDocument.createRange()
      range.setStart(at.node, at.offset)
      range.collapse(true)
      const box = range.getClientRects()[0] ?? root.getBoundingClientRect()
      const height = panel.offsetHeight
      const left = Math.min(Math.max(box.left - 4, EDGE), innerWidth - panel.offsetWidth - EDGE)
      let top = box.bottom + 4
      if (top + height > innerHeight - EDGE) top = Math.max(EDGE, box.top - height - 4)
      // Last resort: never let the list hang off the bottom of the window.
      top = Math.min(Math.max(top, EDGE), Math.max(EDGE, innerHeight - height - EDGE))
      panel.style.left = `${left}px`
      panel.style.top = `${top}px`
    }
    place()
    const raf = requestAnimationFrame(place)
    return () => cancelAnimationFrame(raf)
  }, [pop, items.length])

  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (!isEnter(e)) return
    e.preventDefault()
    if (e.shiftKey || !onEnter) insertText('\n')
    else onEnter()
  }

  return (
    <div className="ca-ment">
      <div
        ref={(node) => {
          el.current = node
          if (inputRef) inputRef.current = node
        }}
        className={className ? `ca-ment__input ${className}` : 'ca-ment__input'}
        style={height ? { height: `${height}px`, maxHeight: 'none' } : undefined}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        spellCheck={false}
        data-ph={placeholder ?? ''}
        onInput={() => refresh()}
        onSelect={() => {
          const root = el.current
          if (!pop || !root) return
          setPop(activeQuery(serialize(root), caretOffset(root)))
        }}
        onKeyDown={keyDown}
        onPaste={paste}
        onBlur={() => setPop(null)}
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={() => { composing.current = false; refresh() }}
      />
      {pop && createPortal(
        <div ref={popEl} className="ca-pop ca-ment__pop" style={{ left: -9999, top: -9999 }} onPointerDown={(e) => e.preventDefault()}>
          <div className="ca-menu ca-ment__menu">
            <div className="ca-gen__label">{t('genPanel.mentionTitle')}</div>
            {items.length ? items.map((m, i) => (
              <button
                key={m.token}
                type="button"
                className="ca-ment__item"
                data-on={i === index || undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(m)}
              >
                <span className="ca-ment__thumb" data-kind={m.kind}><Thumb mention={m} /></span>
                <span className="ca-ment__text">
                  <span className="ca-ment__name">{m.label}</span>
                  <span className="ca-ment__cap">{m.caption}</span>
                </span>
              </button>
            )) : <div className="ca-menu__empty">{t(mentions.length ? 'genPanel.mentionNoMatch' : 'genPanel.mentionEmpty')}</div>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
