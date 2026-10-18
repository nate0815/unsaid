/* 流程圖上四種 node 的外觀。入口在左、出口在右；Choice 每個選項各一個出口。 */

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { ChoiceNode, EndNode, FlowNode, SceneNode } from '../core/project'
import { OUT, optHandle } from './graph'
import { Thumb } from './Thumb'

export type FlowData = { node: FlowNode; problem: boolean }
export type RFNode = Node<FlowData>

const cls = (p: NodeProps<RFNode>, kind: string) =>
  ['fnode', kind, p.selected ? 'selected' : '', p.data.problem ? 'problem' : ''].join(' ')

const firstLine = (s: string, fallback: string) => s.split('\n').find((l) => l.trim())?.trim() || fallback

function StartView(p: NodeProps<RFNode>) {
  return (
    <div className={cls(p, 'start')}>
      <div className="fnode-title">開始</div>
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
      {layer && <Thumb grid={layer.frames[0]} style={n.style} width={168} height={96} />}
      <Handle type="source" position={Position.Right} id={OUT} />
    </div>
  )
}

function ChoiceView(p: NodeProps<RFNode>) {
  const n = p.data.node as ChoiceNode
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
    </div>
  )
}

function EndView(p: NodeProps<RFNode>) {
  const n = p.data.node as EndNode
  return (
    <div className={cls(p, 'end')}>
      <Handle type="target" position={Position.Left} />
      <div className="fnode-title">結尾</div>
      <div className="fnode-prompt">{firstLine(n.text, '（沒有結尾文字）')}</div>
    </div>
  )
}

export const nodeTypes = { start: StartView, scene: SceneView, choice: ChoiceView, end: EndView }
