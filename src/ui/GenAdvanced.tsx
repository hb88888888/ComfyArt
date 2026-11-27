import { useState } from 'react'

import { lorasOf, negativeOf, seedOf } from '../generate'
import { randomSeed } from '../workflows'
import { loraLabel } from '../loras'
import type { ModelDef } from '../models'
import type { GeneratorShape } from '../shapes/GeneratorShape'
import { t } from '../i18n'
import { Icons } from './icons'
import { Popover } from './Popover'

export function AdvancedPill({ shape, model, setMeta }: { shape: GeneratorShape; model: ModelDef; setMeta: (patch: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false)

  const seed = seedOf(shape)
  const negative = negativeOf(shape)
  const loras = lorasOf(shape)
  const hasLora = model.lora !== undefined
  const count = (seed != null ? 1 : 0) + (negative ? 1 : 0) + (hasLora ? loras.length : 0)

  return (
    <Popover open={open} onOpenChange={setOpen} side="top" trigger={({ open: o, toggle }) => (
      <button type="button" className="ca-gen__pill" data-open={o || undefined} onClick={toggle}>
        <span className="ca-gen__pilltext">{t('genAdvanced.advanced')}{count ? ` · ${count}` : ''}</span><span className="ca-gen__chev">{Icons.chevron}</span>
      </button>
    )}>
      <div className="ca-menu ca-gen__settings ca-adv">
        <div className="ca-gen__label">{t('genAdvanced.seed')}</div>
        <div className="ca-style__row">
          <label className="ca-panel__row ca-gen__toggle"><span>{t('genAdvanced.random')}</span><input type="checkbox" checked={seed == null} onChange={(e) => setMeta({ seed: e.target.checked ? null : randomSeed() })} /></label>
          {seed != null && (
            <>
              <input className="ca-adv__seed" type="number" min={0} value={seed} onChange={(e) => setMeta({ seed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} onKeyDown={(e) => e.stopPropagation()} />
              <button type="button" className="ca-panel__icon" title={t('genAdvanced.newSeed')} onClick={() => setMeta({ seed: randomSeed() })}>{Icons.replace}</button>
            </>
          )}
        </div>
        {model.negative && (
          <>
            <div className="ca-gen__label">{t('genAdvanced.negativePrompt')}</div>
            <textarea className="ca-adv__negative" value={negative} placeholder={t('genAdvanced.negativeHint')} onChange={(e) => setMeta({ negative: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </>
        )}
        {hasLora && loras.length > 0 && (
          <>
            <div className="ca-gen__label">LoRA</div>
            {loras.map((l) => (
              <div key={l.name} className="ca-adv__lora">
                <span className="ca-adv__name" title={l.name}>{loraLabel(l.name)}</span>
                <input type="range" min={0} max={200} value={l.strength} onChange={(e) => setMeta({ loras: loras.map((x) => (x.name === l.name ? { ...x, strength: Number(e.target.value) } : x)) })} />
                <span className="ca-panel__val">{l.strength}</span>
                <button type="button" className="ca-panel__icon" title={t('common.remove')} onClick={() => setMeta({ loras: loras.filter((x) => x.name !== l.name) })}>{Icons.close}</button>
              </div>
            ))}
          </>
        )}
      </div>
    </Popover>
  )
}
