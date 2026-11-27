import { useEffect, useRef, useState } from 'react'
import { atom, useValue, type Editor, type TLShapeId } from 'tldraw'

import { imageUrl } from '../comfy'
import { mediaAsset } from '../jobs'
import { Icons } from './icons'
import { useEscape } from './escape'
import { t } from '../i18n'

export const lightboxAtom = atom<TLShapeId | null>('lightbox', null)

interface Item { id: TLShapeId; src: string; name: string; video: boolean; created?: number }

function mediaItems(editor: Editor): Item[] {
  return editor.getCurrentPageShapesSorted().flatMap((s) => {
    const asset = mediaAsset(editor, s)
    if (!asset) return []
    const created = s.meta.createdAt as number | undefined
    return [{ id: s.id, src: asset.props.src, name: asset.props.name, video: asset.type === 'video', created }]
  })
}

export function Lightbox({ editor }: { editor: Editor }) {
  const id = useValue(lightboxAtom)
  const items = useValue('lightbox items', () => (id ? mediaItems(editor) : []), [editor, id])
  const [zoom, setZoom] = useState(1)
  const [muted, setMuted] = useState(false)
  const [turn, setTurn] = useState(0)
  const vid = useRef<HTMLVideoElement>(null)
  const index = items.findIndex((i) => i.id === id)
  useEscape(!!id, () => lightboxAtom.set(null))
  const item = items[index]

  useEffect(() => { setZoom(1); setTurn(0) }, [id])

  // Preview with sound by default. If the browser still refuses to start an unmuted
  // autoplay, keep the clip running muted instead of showing a frozen frame — the bar
  // button (or the player's own controls) turns the sound back on.
  useEffect(() => {
    const v = vid.current
    if (!v) return
    v.muted = muted
    v.play().catch(() => {
      v.muted = true
      if (!muted) setMuted(true)
      v.play().catch(() => {})
    })
  }, [item?.src, muted])

  useEffect(() => {
    if (!id) return
    const go = (d: number) => items.length && lightboxAtom.set(items[(index + d + items.length) % items.length].id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else return
      e.stopPropagation()
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [id, items, index])

  if (!item) return null
  const go = (d: number) => lightboxAtom.set(items[(index + d + items.length) % items.length].id)
  const style = { transform: `scale(${zoom}) rotate(${turn}deg)` }

  return (
    <div className="ca-lightbox" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) lightboxAtom.set(null) }} onWheel={(e) => setZoom((z) => Math.min(8, Math.max(0.2, z * (e.deltaY < 0 ? 1.1 : 0.9))))}>
      {item.video ? <video ref={vid} src={item.src} controls muted={muted} style={style} /> : <img src={imageUrl(item.src)} alt="" style={style} draggable={false} />}
      <button type="button" className="ca-lightbox__nav" data-side="left" title={t('lightbox.previous')} onClick={() => go(-1)}><span className="ca-icon">{Icons.next}</span></button>
      <button type="button" className="ca-lightbox__nav" data-side="right" title={t('lightbox.next')} onClick={() => go(1)}><span className="ca-icon">{Icons.next}</span></button>
      <div className="ca-bar ca-lightbox__bar">
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('lightbox.rotateLeft')} onClick={() => setTurn(turn - 90)}><span className="ca-icon" style={{ transform: 'scaleX(-1)' }}>{Icons.replace}</span></button>
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('lightbox.rotateRight')} onClick={() => setTurn(turn + 90)}><span className="ca-icon">{Icons.replace}</span></button>
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('common.zoomOut')} onClick={() => setZoom(Math.max(0.2, zoom / 1.25))}><span className="ca-icon">{Icons.minus}</span></button>
        <span className="ca-lightbox__zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('common.zoomIn')} onClick={() => setZoom(Math.min(8, zoom * 1.25))}><span className="ca-icon">{Icons.plus}</span></button>
        {item.video && <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={muted ? t('lightbox.unmute') : t('lightbox.mute')} onClick={() => setMuted(!muted)}><span className="ca-icon">{muted ? Icons.soundOff : Icons.sound}</span></button>}
        <div className="ca-bar__sep" />
        <a className="ca-bar__btn ca-bar__btn--icon" href={item.src} download={item.name} title={t('common.download')}><span className="ca-icon">{Icons.download}</span></a>
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('common.close')} onClick={() => lightboxAtom.set(null)}><span className="ca-icon">{Icons.close}</span></button>
      </div>
      <div className="ca-lightbox__count">{index + 1} / {items.length}</div>
      {typeof item.created === 'number' && <div className="ca-lightbox__time">{t('selectionLabel.createdAt', new Date(item.created).toLocaleString())}</div>}
    </div>
  )
}
