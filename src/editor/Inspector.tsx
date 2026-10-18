/* 右側的屬性面板：選到哪個 node 就編它。
 * Scene 這裡只放常用的幾項；完整的調參（輪廓、逐格手修、轉場）是 M4「Scene 編輯面板」的事。 */

import { useRef, type ReactNode } from 'react'
import { COLS_MAX, COLS_MIN } from '../core/convert'
import {
  CHOICE_MAX,
  CHOICE_MIN,
  DEFAULT_PARAMS,
  type ChoiceNode,
  type ConvertParams,
  type EffectKind,
  type EndNode,
  type FlowNode,
  type SceneNode,
} from '../core/project'
import { sourceFromFile } from '../media/render-source'
import { addOption, removeOption } from './graph'
import { Thumb } from './Thumb'

type Patch<T> = (fn: (n: T) => T) => void

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function Range(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <Field label={props.label}>
      <div className="range">
        <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(+e.target.value)} />
        <output>{props.step < 1 ? props.value.toFixed(2) : props.value}</output>
      </div>
    </Field>
  )
}

const FX: [EffectKind, string][] = [
  ['typewriter', '打字機（進場）'],
  ['decode', '解碼（進場）'],
  ['wave', '波浪（持續）'],
  ['glitch', '故障（持續）'],
]
const FX_DEFAULT: Record<EffectKind, { speed: number; intensity: number }> = {
  typewriter: { speed: 1, intensity: 0.3 },
  decode: { speed: 1, intensity: 0.8 },
  wave: { speed: 1, intensity: 0.4 },
  glitch: { speed: 1, intensity: 0.4 },
}

export function SceneInspector({ node, patch, hideThumb }: { node: SceneNode; patch: Patch<SceneNode>; hideThumb?: boolean }) {
  const file = useRef<HTMLInputElement>(null)
  const src = node.source
  const setParams = (p: Partial<ConvertParams>) =>
    patch((n) => (n.source ? { ...n, source: { ...n.source, params: { ...n.source.params, ...p } } } : n))
  const kind = src?.layer.kind
  const isImage = kind === 'image' || kind === 'gif'

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const layer = await sourceFromFile(f)
    patch((n) => ({ ...n, source: { layer, params: n.source?.params ?? { ...DEFAULT_PARAMS } } }))
  }

  return (
    <>
      {node.layers[0] && !hideThumb && (
        <div className="inspector-thumb">
          <Thumb grid={node.layers[0].frames[0]} style={node.style} width={288} height={180} />
        </div>
      )}
      {!src && <p className="field-hint">這個 Scene 是從匯出的 HTML 取回的，沒有原圖，只能沿用已轉好的畫面。換一張圖或改成文字就能重新編輯。</p>}

      <Field label="圖層來源">
        <div className="seg">
          <button className={kind === 'text' ? 'on' : ''} onClick={() => patch((n) => ({ ...n, source: { layer: { kind: 'text', text: textOf(n) }, params: n.source?.params ?? { ...DEFAULT_PARAMS } } }))}>
            文字
          </button>
          <button className={isImage ? 'on' : ''} onClick={() => file.current?.click()}>
            {isImage ? '換一張圖…' : '圖片／GIF…'}
          </button>
        </div>
        <input ref={file} type="file" accept="image/*,.gif" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </Field>

      {kind === 'text' && src?.layer.kind === 'text' && (
        <Field label="文字內容" hint="Enter 換行">
          <textarea
            rows={4}
            value={src.layer.text}
            onChange={(e) => patch((n) => ({ ...n, source: { ...n.source!, layer: { kind: 'text', text: e.target.value } } }))}
          />
        </Field>
      )}

      {isImage && src && (
        <>
          <Field label="字元模式">
            <div className="seg">
              <button className={src.params.mode === 'message' ? 'on' : ''} onClick={() => setParams({ mode: 'message' })}>
                訊息填充 ⭐
              </button>
              <button className={src.params.mode === 'density' ? 'on' : ''} onClick={() => setParams({ mode: 'density' })}>
                密度
              </button>
            </div>
          </Field>
          {src.params.mode === 'message' ? (
            <Field label="要填進去的話">
              <textarea rows={3} value={src.params.message} onChange={(e) => setParams({ message: e.target.value })} />
            </Field>
          ) : (
            <Field label="字元組" hint="自動依墨量排序">
              <input type="text" value={src.params.charset} onChange={(e) => setParams({ charset: e.target.value })} />
            </Field>
          )}
        </>
      )}

      {src && <Range label="欄數" value={src.params.cols} min={COLS_MIN} max={COLS_MAX} step={1} onChange={(v) => setParams({ cols: v })} />}
      {isImage && src && (
        <>
          <Range label="亮度" value={src.params.brightness} min={-1} max={1} step={0.01} onChange={(v) => setParams({ brightness: v })} />
          <Range label="對比" value={src.params.contrast} min={0} max={3} step={0.01} onChange={(v) => setParams({ contrast: v })} />
          {src.params.mode === 'message' && (
            <Range label="亮度門檻" value={src.params.threshold} min={0} max={1} step={0.01} onChange={(v) => setParams({ threshold: v })} />
          )}
          <Field label="反相">
            <input type="checkbox" checked={src.params.invert} onChange={(e) => setParams({ invert: e.target.checked })} />
          </Field>
        </>
      )}

      <Field label="顏色">
        <div className="colors">
          <input type="color" value={node.style.fg} title="前景" onChange={(e) => patch((n) => ({ ...n, style: { ...n.style, fg: e.target.value } }))} />
          <input type="color" value={node.style.bg} title="背景" onChange={(e) => patch((n) => ({ ...n, style: { ...n.style, bg: e.target.value } }))} />
          {isImage && (
            <label className="inline">
              <input type="checkbox" checked={node.style.useColors} onChange={(e) => patch((n) => ({ ...n, style: { ...n.style, useColors: e.target.checked } }))} />
              沿用原圖色
            </label>
          )}
        </div>
      </Field>

      <Field label="特效">
        <div className="checks">
          {FX.map(([k, name]) => {
            const on = node.effects.some((e) => e.kind === k)
            return (
              <label className="inline" key={k}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    patch((n) => ({
                      ...n,
                      effects: e.target.checked ? [...n.effects, { kind: k, ...FX_DEFAULT[k] }] : n.effects.filter((x) => x.kind !== k),
                    }))
                  }
                />
                {name}
              </label>
            )
          })}
        </div>
      </Field>

      <Field label="推進方式">
        <div className="seg">
          <button className={node.advance.mode === 'click' ? 'on' : ''} onClick={() => patch((n) => ({ ...n, advance: { mode: 'click' } }))}>
            點一下繼續
          </button>
          <button className={node.advance.mode === 'auto' ? 'on' : ''} onClick={() => patch((n) => ({ ...n, advance: { mode: 'auto', seconds: 4 } }))}>
            自動
          </button>
        </div>
      </Field>
      {node.advance.mode === 'auto' && (
        <Range label="停留秒數" value={node.advance.seconds} min={1} max={30} step={1} onChange={(v) => patch((n) => ({ ...n, advance: { mode: 'auto', seconds: v } }))} />
      )}
    </>
  )
}

function textOf(n: SceneNode): string {
  return n.source?.layer.kind === 'text' ? n.source.layer.text : '新的畫面'
}

function ChoiceInspector({ node, patch }: { node: ChoiceNode; patch: Patch<ChoiceNode> }) {
  return (
    <>
      <Field label="提問" hint="疊在上一個畫面上顯示">
        <textarea rows={2} value={node.prompt} onChange={(e) => patch((n) => ({ ...n, prompt: e.target.value }))} />
      </Field>
      <Field label={`選項（${CHOICE_MIN}～${CHOICE_MAX} 個）`}>
        <div className="options">
          {node.options.map((o, i) => (
            <div className="option" key={i}>
              <span className="key">{i + 1}</span>
              <input
                type="text"
                value={o.label}
                onChange={(e) => patch((n) => ({ ...n, options: n.options.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) }))}
              />
              <button title="刪除這個選項" disabled={node.options.length <= CHOICE_MIN} onClick={() => patch((n) => removeOption(n, i))}>
                ✕
              </button>
            </div>
          ))}
          <button disabled={node.options.length >= CHOICE_MAX} onClick={() => patch(addOption)}>
            ＋ 新增選項
          </button>
        </div>
      </Field>
    </>
  )
}

function EndInspector({ node, patch }: { node: EndNode; patch: Patch<EndNode> }) {
  return (
    <>
      <Field label="結尾文字" hint="可以空白">
        <textarea rows={3} value={node.text} onChange={(e) => patch((n) => ({ ...n, text: e.target.value }))} />
      </Field>
      <Field label="顯示「重看」">
        <input type="checkbox" checked={node.replay} onChange={(e) => patch((n) => ({ ...n, replay: e.target.checked }))} />
      </Field>
    </>
  )
}

const TITLES = { start: '開始', scene: 'Scene', choice: 'Choice', end: '結尾' }

export function Inspector({ node, problems, patch }: { node: FlowNode | null; problems: string[]; patch: Patch<FlowNode> }) {
  if (!node) return <aside className="inspector empty">點一個 node 來編輯它。<br />拖曳 node 右側的圓點到另一個 node，就能連線。</aside>
  return (
    <aside className="inspector">
      <h2>{TITLES[node.type]}</h2>
      {problems.map((m, i) => (
        <p className="problem-line" key={i}>⚠ {m}</p>
      ))}
      {node.type === 'start' && <p className="field-hint">訊息從這裡開始。每則訊息恰好一個，不能刪除。</p>}
      {node.type === 'scene' && (
        <>
          <p className="field-hint">在流程圖上雙擊這個 Scene，可以打開大的編輯畫面。</p>
          <SceneInspector node={node} patch={patch as Patch<SceneNode>} />
        </>
      )}
      {node.type === 'choice' && <ChoiceInspector node={node} patch={patch as Patch<ChoiceNode>} />}
      {node.type === 'end' && <EndInspector node={node} patch={patch as Patch<EndNode>} />}
    </aside>
  )
}
