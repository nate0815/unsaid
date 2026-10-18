/* 流程推進：Start → Scene → Choice → … → End。純邏輯，不碰畫面。
 * 規格見 DESIGN「Node 種類」。專案應該已經過 `validateProject`；這裡仍對壞連結做防呆，不讓播放器卡死。 */

import type { ChoiceNode, EndNode, FlowNode, Project, SceneNode } from '../core/project'

export type Step =
  | { kind: 'scene'; node: SceneNode }
  | { kind: 'choice'; node: ChoiceNode }
  | { kind: 'end'; node: EndNode }

/** 壞掉的連結（接到不存在的 node、或沒接）一律走到這個 End，而不是當掉。 */
const BROKEN_END: EndNode = { id: '__broken__', type: 'end', replay: true }

export class Flow {
  private readonly byId: Map<string, FlowNode>
  private readonly startNext: string | null
  current: Step | null = null
  /** 最近一個顯示過的 Scene —— Choice 要疊在它上面（DESIGN「Node 種類」）。 */
  lastScene: SceneNode | null = null

  constructor(project: Project) {
    this.byId = new Map(project.nodes.map((n) => [n.id, n]))
    const start = project.nodes.find((n) => n.type === 'start')
    this.startNext = start && start.type === 'start' ? start.next : null
  }

  /** 從頭開始（也是「重看」）。 */
  begin(): Step {
    this.lastScene = null
    return this.go(this.startNext)
  }

  /** 目前是 Scene：往下一個走。其他情況不動。 */
  advance(): Step {
    const cur = this.current
    if (!cur || cur.kind !== 'scene') return cur ?? this.begin()
    return this.go(cur.node.next)
  }

  /** 目前是 Choice：選第 i 個（從 0 起算）。超出範圍不動。 */
  choose(i: number): Step {
    const cur = this.current
    if (!cur || cur.kind !== 'choice') return cur ?? this.begin()
    const opt = cur.node.options[i]
    if (!opt) return cur
    return this.go(opt.next)
  }

  private go(id: string | null): Step {
    // Start 被接回來（例如 End 前的連結指回 Start）就從頭；最多跳 2 次，避免 Start 指向自己時無限迴圈。
    for (let hop = 0; hop < 2 && id !== null; hop++) {
      const n = this.byId.get(id)
      if (!n || n.type !== 'start') break
      id = n.next
    }
    const n = id === null ? undefined : this.byId.get(id)
    let step: Step
    if (!n || n.type === 'start') step = { kind: 'end', node: BROKEN_END }
    else if (n.type === 'scene') step = { kind: 'scene', node: n }
    else if (n.type === 'choice') step = { kind: 'choice', node: n }
    else step = { kind: 'end', node: n }
    if (step.kind === 'scene') this.lastScene = step.node
    this.current = step
    return step
  }
}
