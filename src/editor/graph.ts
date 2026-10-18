/* 流程圖的編輯操作：新增／刪除 node、連線、斷線、移動。全部是純函式（舊專案進、新專案出），不碰畫面。
 *
 * 連線就是改 node 的 `next`（Start、Scene）或 `options[i].next`（Choice）。
 * 每個出口最多一條線 —— 接新的就取代舊的（DESIGN「Node 種類」：一個出口接到一個東西）。 */

import { stillClip } from '../core/grid'
import {
  CHOICE_MAX,
  CHOICE_MIN,
  DEFAULT_PARAMS,
  type ChoiceNode,
  type EndNode,
  type FlowNode,
  type Project,
  type SceneNode,
} from '../core/project'
import { textGrid } from '../media/render-source'

export type AddableType = 'scene' | 'choice' | 'end'
export type Pos = { x: number; y: number }

/** 出口的 handle id：Start／Scene 是 'out'，Choice 的第 i 個選項是 'opt-i'。 */
export const OUT = 'out'
export const optHandle = (i: number) => `opt-${i}`

export interface Edge {
  id: string
  source: string
  sourceHandle: string
  target: string
}

let counter = 0
export function newId(type: string): string {
  counter = (counter + 1) % 1e6
  return `${type}-${Date.now().toString(36)}${counter.toString(36)}`
}

export function newScene(id: string, text: string): SceneNode {
  const params = { ...DEFAULT_PARAMS, cols: 36 }
  return {
    id,
    type: 'scene',
    layers: [stillClip(textGrid(text, params.cols))],
    style: { fg: '#f1e7d8', bg: '#0b0b0d', useColors: true },
    effects: [{ kind: 'decode', speed: 1, intensity: 0.8 }],
    advance: { mode: 'click' },
    next: null,
    source: { layer: { kind: 'text', text }, params },
  }
}

function newNode(type: AddableType, id: string): FlowNode {
  if (type === 'scene') return newScene(id, '新的畫面')
  if (type === 'choice') {
    const c: ChoiceNode = { id, type: 'choice', prompt: '', options: [{ label: '是', next: null }, { label: '否', next: null }] }
    return c
  }
  const e: EndNode = { id, type: 'end', text: '', replay: true }
  return e
}

/** 空白專案：Start → 一個文字 Scene → End，接好了，可以直接預覽。 */
export function newProject(): Project {
  const scene = newScene('scene-1', '有些話，\n我一直沒有說出口。')
  scene.next = 'end-1'
  return {
    title: '一則訊息',
    nodes: [
      { id: 'start', type: 'start', next: 'scene-1' },
      scene,
      { id: 'end-1', type: 'end', text: '謝謝你看完。', replay: true },
    ],
    layout: { start: { x: 0, y: 120 }, 'scene-1': { x: 220, y: 60 }, 'end-1': { x: 560, y: 120 } },
  }
}

export function addNode(p: Project, type: AddableType, pos: Pos): { project: Project; id: string } {
  const id = newId(type)
  return { project: { ...p, nodes: [...p.nodes, newNode(type, id)], layout: { ...p.layout, [id]: freeSpot(p, pos) } }, id }
}

/** 刪除 node，並把所有指向它的連線清成「沒接」。Start 不能刪（每個專案恰好一個）。 */
export function removeNodes(p: Project, ids: string[]): Project {
  const gone = new Set(ids.filter((id) => p.nodes.find((n) => n.id === id)?.type !== 'start'))
  if (gone.size === 0) return p
  const fix = (t: string | null) => (t !== null && gone.has(t) ? null : t)
  const nodes = p.nodes
    .filter((n) => !gone.has(n.id))
    .map((n): FlowNode => {
      if (n.type === 'start' || n.type === 'scene') return n.next !== null && gone.has(n.next) ? { ...n, next: null } : n
      if (n.type === 'choice') return { ...n, options: n.options.map((o) => ({ ...o, next: fix(o.next) })) }
      return n
    })
  const layout = { ...p.layout }
  for (const id of gone) delete layout[id]
  return { ...p, nodes, layout }
}

function setOutlet(n: FlowNode, handle: string, target: string | null): FlowNode {
  if ((n.type === 'start' || n.type === 'scene') && handle === OUT) return { ...n, next: target }
  if (n.type === 'choice') {
    const i = Number(handle.replace(/^opt-/, ''))
    if (!Number.isInteger(i) || !n.options[i]) return n
    return { ...n, options: n.options.map((o, k) => (k === i ? { ...o, next: target } : o)) }
  }
  return n
}

/** 能不能從 source 的這個出口接到 target。End 沒有出口；Start 沒有入口；不接自己。 */
export function canConnect(p: Project, source: string, target: string): boolean {
  const s = p.nodes.find((n) => n.id === source)
  const t = p.nodes.find((n) => n.id === target)
  return !!s && !!t && s.type !== 'end' && t.type !== 'start' && source !== target
}

export function connect(p: Project, source: string, handle: string, target: string): Project {
  if (!canConnect(p, source, target)) return p
  return { ...p, nodes: p.nodes.map((n) => (n.id === source ? setOutlet(n, handle, target) : n)) }
}

export function disconnect(p: Project, source: string, handle: string): Project {
  return { ...p, nodes: p.nodes.map((n) => (n.id === source ? setOutlet(n, handle, null) : n)) }
}

export function edges(p: Project): Edge[] {
  const ids = new Set(p.nodes.map((n) => n.id))
  const out: Edge[] = []
  const push = (source: string, sourceHandle: string, target: string | null) => {
    if (target !== null && ids.has(target)) out.push({ id: `${source}:${sourceHandle}`, source, sourceHandle, target })
  }
  for (const n of p.nodes) {
    if (n.type === 'start' || n.type === 'scene') push(n.id, OUT, n.next)
    if (n.type === 'choice') n.options.forEach((o, i) => push(n.id, optHandle(i), o.next))
  }
  return out
}

export function updateNode<T extends FlowNode>(p: Project, id: string, patch: (n: T) => T): Project {
  return { ...p, nodes: p.nodes.map((n) => (n.id === id ? patch(n as T) : n)) }
}

export function moveNode(p: Project, id: string, pos: Pos): Project {
  return { ...p, layout: { ...p.layout, [id]: pos } }
}

/** Choice 加一個選項（上限 CHOICE_MAX）。 */
export function addOption(n: ChoiceNode): ChoiceNode {
  if (n.options.length >= CHOICE_MAX) return n
  return { ...n, options: [...n.options, { label: `選項 ${n.options.length + 1}`, next: null }] }
}

/** Choice 刪第 i 個選項（下限 CHOICE_MIN）。後面的選項往前遞補，連線跟著走。 */
export function removeOption(n: ChoiceNode, i: number): ChoiceNode {
  if (n.options.length <= CHOICE_MIN) return n
  return { ...n, options: n.options.filter((_, k) => k !== i) }
}

/** node 大約的佔地（流程圖座標）。只用來找空位，不必精準。 */
const NODE_W = 220
const NODE_H = 150

/** 從 pos 開始往下找一個不會疊在既有 node 上的位置 —— 新加的 node 才不會蓋住別人。 */
export function freeSpot(p: Project, pos: Pos): Pos {
  const taken = Object.values(p.layout ?? {})
  let spot = { ...pos }
  for (let i = 0; i < 50; i++) {
    if (!taken.some((t) => Math.abs(t.x - spot.x) < NODE_W && Math.abs(t.y - spot.y) < NODE_H)) return spot
    spot = { x: spot.x, y: spot.y + NODE_H }
  }
  return spot
}

/** 沒有存位置的 node（例如從匯出的 HTML 取回的專案）排成由左到右的一列。 */
export function ensureLayout(p: Project): Project {
  const layout = { ...p.layout }
  let x = 0
  let changed = false
  for (const n of p.nodes) {
    if (!layout[n.id]) {
      layout[n.id] = { x, y: n.type === 'start' ? 120 : 60 }
      changed = true
    }
    x = Math.max(x, layout[n.id].x) + 280
  }
  return changed ? { ...p, layout } : p
}
