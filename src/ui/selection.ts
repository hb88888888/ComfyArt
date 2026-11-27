import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useEditor, useValue, type Box, type TLImageShape, type TLShape } from 'tldraw'

import { GENERATOR, type GeneratorShape } from '../shapes/GeneratorShape'

export interface ScreenRect { l: number; t: number; r: number; b: number }

export function useSelectionRect(): ScreenRect | null {
  const editor = useEditor()
  return useValue('selection rect', () => {
    if (editor.getCroppingShapeId() || editor.isIn('select.resizing') || editor.isIn('select.translating')) return null
    const bounds: Box | undefined = editor.getSelectionPageBounds() ?? undefined
    if (!bounds) return null
    const a = editor.pageToViewport({ x: bounds.minX, y: bounds.minY })
    const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return { l: a.x, t: a.y, r: b.x, b: b.y }
  }, [editor])
}

export function useOnlySelected<T extends TLShape>(type: T['type']): T | null {
  const editor = useEditor()
  return useValue('only selected', () => {
    const shape = editor.getOnlySelectedShape()
    return shape?.type === type ? (shape as T) : null
  }, [editor, type])
}

export const useSelectedImage = () => useOnlySelected<TLImageShape>('image')
export const useSelectedGenerator = () => useOnlySelected<GeneratorShape>(GENERATOR)

export function useElementSize(ref: RefObject<HTMLElement | null>, initial: { w: number; h: number }) {
  const [size, setSize] = useState(initial)
  const observer = useRef<ResizeObserver | null>(null)
  const watched = useRef<HTMLElement | null>(null)
  // Measured on every render *and* whenever the box itself changes size, so a panel
  // that grows from the inside (a dragged-larger prompt) is repositioned too.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }))
    measure()
    if (watched.current !== el) {
      observer.current?.disconnect()
      observer.current = new ResizeObserver(measure)
      observer.current.observe(el)
      watched.current = el
    }
  })
  useEffect(() => () => { observer.current?.disconnect(); watched.current = null }, [])
  return size
}
