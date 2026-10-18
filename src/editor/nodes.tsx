/* 流程圖上四種 node 的外觀。入口在左、出口在右；Choice 每個選項各一個出口。 */

import { Handle, Position, useUpdateNodeInternals, type NodeProps, type Node } from '@xyflow/react'
import { useEffect } from 'react'
import { CHOICE_MAX, type ChoiceNode, type EndNode, type FlowNode, type SceneNode, type Screen } from '../core/project'
import { OUT, optHandle } from './graph'
import { Thumb } from './Thumb'

/** `onAddOption`：Choice node 上的「＋」按下時呼叫（只有 Choice 會帶）。 */
export type FlowData = { node: FlowNode; problem: boolean; onAddOption?: () => void }
export type RFNode = Node<FlowData>

const cls = (p: NodeProps<RFNode>, kind: string) =>
  ['fnode', kind, p.selected ? 'selected' : '', p.data.problem ? 'problem' : ''].join(' ')

const firstLine = (s: string, fallback: string) => s.split('\n').find((l) => l.trim())?.trim() || fallback

/** 畫面的縮圖。Scene、Start／End 的畫面共用。 */
const ScreenThumb = ({ s }: { s: Screen }) => (s.layers[0] ? <Thumb grid={s.layers[0].frames[0]} style={s.style} width={168} height={96} /> : null)

function StartView(p: NodeProps<RFNode>) {
  const n = p.data.node as FlowNode & { type: 'start' }
  return (
    <div className={cls(p, n.screen ? 'start has-screen' : 'start')}>
      <div className="fnode-title">開始</div>
      {n.screen && <ScreenThumb s={n.screen} />}
      <Handle type="source" position={Position.Right} id={OUT} />
    </div>
  )
}

function SceneView(p: NodeProps<RFNode>) {
  const n = p.data.node as SceneNode
  const layer = n.layers[0]
  const frames = layer?.frames.length ?? 0
  const label =
    n.source?.layer.kind === 'text' ? '文字' : n.source?.layer.kind === 'gif' ? `GIF・${frames} 格` : n.source ? '圖片' : '畫面'
  return (
    <div className={cls(p, 'scene')}>
      <Handle type="target" position={Position.Left} />
      <div className="fnode-title">
        Scene <small>{label}{n.advance.mode === 'auto' ? `・${n.advance.seconds} 秒` : ''}</small>
      </div>
      <ScreenThumb s={n} />
      <Handle type="source" position={Position.Right} id={OUT} />
    </div>
  )
}

function ChoiceView(p: NodeProps<RFNode>) {
  const n = p.data.node as ChoiceNode
  // 選項數一變，出口 handle 跟著增減：要叫 React Flow 重量一次 handle 的位置，連線才接得到新的出口。
  const updateInternals = useUpdateNodeInternals()
  useEffect(() => updateInternals(p.id), [n.options.length, p.id, updateInternals])
  return (
    <div className={cls(p, 'choice')}>
      <Handle type="target" position={Position.Left} />
      <div className="fnode-title">Choice</div>
      <div className="fnode-prompt">{firstLine(n.prompt, '（還沒寫提問）')}</div>
      {n.options.map((o, i) => (
        <div className="fnode-option" key={i}>
          <span className="key">{i + 1}</span>
          {o.label || '（空白）'}
          <Handle type="source" position={Position.Right} id={optHandle(i)} />
        </div>
      ))}
      {n.options.length < CHOICE_MAX && (
        <button
          className="fnode-add nodrag"
          title="新增選項"
          onClick={(e) => {
            e.stopPropagation()
            p.data.onAddOption?.()
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          ＋
        </button>
      )}
    </div>
  )
}

function EndView(p: NodeProps<RFNode>) {
  const n = p.data.node as EndNode
  return (
    <div className={cls(p, 'end')}>
      <Handle type="target" position={Position.Left} />
      <div className="fnode-title">結尾</div>
      {n.screen ? <ScreenThumb s={n.screen} /> : <div className="fnode-prompt">（沒有結尾畫面）</div>}
    </div>
  )
}

export const nodeTypes = { start: StartView, scene: SceneView, choice: ChoiceView, end: EndView }
