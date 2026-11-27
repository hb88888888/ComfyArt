import { useEffect, useRef } from 'react'
import { HTMLContainer, useEditor, useImageOrVideoAsset, useIsEditing, useValue, VideoShapeUtil, type TLVideoShape } from 'tldraw'

import { isViewUrl, thumbSize, thumbUrl } from '../comfy'

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
  // Hover or double-click: both show the browser's native player controls (play/pause,
  // time, volume, seek bar, fullscreen, more) exactly like a Save Video node preview.
  const active = hovered || editing

  useEffect(() => {
    const v = video.current
    if (!v) return
    if (active) {
      // A hover is not a user gesture, so browsers may refuse unmuted autoplay. Fall
      // back to muted playback; the native volume control lets the user turn sound on.
      v.play().catch(() => {
        if (!v.muted) {
          v.muted = true
          v.play().catch(() => {})
        }
      })
      return
    }
    v.pause()
    // Keep the current frame: once the user has scrubbed or paused with the native
    // controls, leaving the shape must not throw that position away.
  }, [active, url])

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
              loop
              preload="none"
              disableRemotePlayback
              disablePictureInPicture
              controls={active}
              style={active ? { pointerEvents: 'all' } : undefined}
              aria-label={shape.props.altText}
            />
          )}
        </div>
      </div>
    </HTMLContainer>
  )
}
