import { useEffect, useRef, useState } from 'react'
import { HTMLContainer, useEditor, useImageOrVideoAsset, useIsEditing, useValue, VideoShapeUtil, type TLVideoShape } from 'tldraw'

import { isViewUrl, thumbSize, thumbUrl } from '../comfy'
import { t } from '../i18n'
import { Icons } from '../ui/icons'

export class HoverVideoShapeUtil extends VideoShapeUtil {
  override component(shape: TLVideoShape) {
    return <HoverVideo shape={shape} />
  }
}

function HoverVideo({ shape }: { shape: TLVideoShape }) {
  const editor = useEditor()
  const video = useRef<HTMLVideoElement>(null)
  const editing = useIsEditing(shape.id)
  const hovered = useValue('video hovered', () => editor.getHoveredShapeId() === shape.id, [editor, shape.id])
  const size = useValue('video poster size', () => thumbSize(shape.props.w * editor.getEfficientZoomLevel() * editor.getInstanceState().devicePixelRatio) ?? 1024, [shape.props.w])
  const { url } = useImageOrVideoAsset({ shapeId: shape.id, assetId: shape.props.assetId, width: shape.props.w })
  const playing = hovered || editing
  // Previews play with sound by default. Browsers only allow an unmuted autoplay once the
  // page has had a gesture, so the play below falls back to muted (and the button shows
  // the real state) instead of freezing on the poster.
  const [sound, setSound] = useState(true)
  const muted = !sound && !editing

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.muted = muted
    if (playing) {
      v.play().catch(() => {
        if (v.muted) return
        v.muted = true
        setSound(false)
        v.play().catch(() => {})
      })
      return
    }
    v.pause()
    // A hover preview is a glance, not a viewing session: put the poster back to the
    // first frame instead of freezing wherever the pointer happened to leave.
    if (!editing && v.currentTime > 0) {
      try {
        v.currentTime = 0
      } catch {
        /* the stream may not be seekable yet; the poster still shows */
      }
    }
  }, [playing, url, muted, editing])

  // Sound is the default for every glance, so a glance that had to fall back to muted
  // gets another chance next time the pointer comes back.
  useEffect(() => {
    if (!playing) setSound(true)
  }, [playing])

  return (
    <HTMLContainer id={shape.id}>
      <div className="tl-counter-scaled">
        <div className="tl-video-container">
          {url && (
            <video
              ref={video}
              key={url}
              className="tl-video"
              src={url}
              poster={isViewUrl(url) ? thumbUrl(url, size) : undefined}
              width="100%"
              height="100%"
              draggable={false}
              playsInline
              muted={muted}
              loop
              preload="none"
              disableRemotePlayback
              disablePictureInPicture
              controls={editing}
              style={editing ? { pointerEvents: 'all' } : undefined}
              aria-label={shape.props.altText}
            />
          )}
          {url && !editing && (
            <button
              type="button"
              className="tl-video-sound"
              data-on={sound || undefined}
              title={sound ? t('lightbox.mute') : t('lightbox.unmute')}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setSound((on) => !on) }}
            >
              <span className="ca-icon">{sound ? Icons.sound : Icons.soundOff}</span>
            </button>
          )}
        </div>
      </div>
    </HTMLContainer>
  )
}
