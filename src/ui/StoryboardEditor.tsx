import { DURATIONS } from '../genOptions'
import type { Scene } from '../videoGraphs'
import type { Mention } from '../mentions'
import { Icons } from './icons'
import { Chips } from './Chips'
import { MentionTextarea } from './MentionInput'
import { t } from '../i18n'

export function StoryboardEditor({ scenes, onChange, onSmart, smartBusy, mentions }: { scenes: Scene[]; onChange: (scenes: Scene[]) => void; onSmart: () => void; smartBusy: boolean; mentions: Mention[] }) {
  const total = scenes.reduce((n, s) => n + s.duration, 0)
  const set = (i: number, patch: Partial<Scene>) => onChange(scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  return (
    <div className="ca-story">
      {scenes.map((s, i) => (
        <div key={i} className="ca-story__scene">
          <div className="ca-story__head">
            <span>{t('storyboardEditor.scene', i + 1)}</span>
            <Chips value={s.duration} options={DURATIONS.map((d) => [d, `${d}s`] as const)} onPick={(d) => set(i, { duration: d })} />
            {scenes.length > 1 && <button type="button" className="ca-history__del" title={t('common.delete')} onClick={() => onChange(scenes.filter((_, j) => j !== i))}>{Icons.trash}</button>}
          </div>
          <MentionTextarea
            className="ca-story__prompt"
            value={s.prompt}
            mentions={mentions}
            placeholder={t('storyboardEditor.describeThisScene')}
            onChange={(next) => set(i, { prompt: next })}
          />
        </div>
      ))}
      <div className="ca-story__foot">
        <button type="button" className="ca-panel__chip" onClick={() => onChange([...scenes, { prompt: '', duration: DURATIONS[0] }])}>{t('storyboardEditor.addScene', scenes.length + 1)}</button>
        <button type="button" className="ca-panel__chip" disabled={smartBusy || !scenes.some((s) => s.prompt.trim())} title={t('storyboardEditor.automaticallySplitTheFirstScene')} onClick={onSmart}>{smartBusy ? t('storyboardEditor.splitting') : t('storyboardEditor.smartStoryboard')}</button>
        <span className="ca-story__total">{t('storyboardEditor.total', total)}</span>
      </div>
    </div>
  )
}
