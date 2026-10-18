import { describe, expect, it } from 'vitest'
import { decodeProject, encodeProject, validateProject, type ChoiceNode, type Project, type SceneNode } from '../src/core/project'
import {
  addNode,
  addOption,
  canConnect,
  connect,
  disconnect,
  edges,
  ensureLayout,
  freeSpot,
  newProject,
  optHandle,
  OUT,
  removeNodes,
  removeOption,
} from '../src/editor/graph'
import { buildHtml } from '../src/media/export-html'
import { extractProjectFile } from '../src/core/project'

const find = <T,>(p: Project, id: string) => p.nodes.find((n) => n.id === id) as T

describe('新訊息', () => {
  it('一開始就接好了：Start → Scene → 結尾，沒有任何問題', () => {
    const p = newProject()
    expect(validateProject(p)).toEqual([])
    expect(edges(p).map((e) => `${e.source}→${e.target}`)).toEqual(['start→scene-1', 'scene-1→end-1'])
  })
})

describe('連線與斷線', () => {
  it('從出口拉到另一個 node 就接上；同一個出口再接一次會取代舊的', () => {
    let p = newProject()
    const { project, id } = addNode(p, 'end', { x: 0, y: 0 })
    p = connect(project, 'scene-1', OUT, id)
    expect(find<SceneNode>(p, 'scene-1').next).toBe(id)
    expect(edges(p).filter((e) => e.source === 'scene-1')).toHaveLength(1)
  })

  it('Choice 每個選項各自一個出口', () => {
    let { project: p, id } = addNode(newProject(), 'choice', { x: 0, y: 0 })
    p = connect(p, id, optHandle(1), 'end-1')
    const c = find<ChoiceNode>(p, id)
    expect(c.options[0].next).toBeNull()
    expect(c.options[1].next).toBe('end-1')
  })

  it('不能接：結尾往外接、接回 Start、接自己', () => {
    const p = newProject()
    expect(canConnect(p, 'end-1', 'scene-1')).toBe(false)
    expect(canConnect(p, 'scene-1', 'start')).toBe(false)
    expect(canConnect(p, 'scene-1', 'scene-1')).toBe(false)
    expect(connect(p, 'end-1', OUT, 'scene-1')).toBe(p)
  })

  it('斷線之後驗證會指出那個出口沒接', () => {
    const p = disconnect(newProject(), 'scene-1', OUT)
    expect(validateProject(p).map((x) => x.node)).toContain('scene-1')
  })
})

describe('刪除', () => {
  it('刪掉 node，指向它的連線一起清成「沒接」，位置也拿掉', () => {
    const p = removeNodes(newProject(), ['end-1'])
    expect(p.nodes.map((n) => n.id)).toEqual(['start', 'scene-1'])
    expect(find<SceneNode>(p, 'scene-1').next).toBeNull()
    expect(p.layout?.['end-1']).toBeUndefined()
  })

  it('Start 不能刪（每則訊息恰好一個）', () => {
    const p = newProject()
    expect(removeNodes(p, ['start'])).toBe(p)
  })
})

describe('Choice 選項', () => {
  const base: ChoiceNode = { id: 'c', type: 'choice', prompt: '', options: [{ label: 'a', next: 'x' }, { label: 'b', next: 'y' }] }

  it('最少 2 個、最多 8 個', () => {
    expect(removeOption(base, 0)).toBe(base)
    let c = base
    for (let i = 0; i < 10; i++) c = addOption(c)
    expect(c.options).toHaveLength(8)
  })

  it('刪掉中間的選項，後面的往前遞補，連線跟著走', () => {
    const c = removeOption(addOption(base), 0)
    expect(c.options.map((o) => o.next)).toEqual(['y', null])
  })
})

describe('沒有位置的專案（例如從 HTML 取回）', () => {
  it('自動排成一列，每個 node 都有位置', () => {
    const p = newProject()
    delete p.layout
    const q = ensureLayout(p)
    expect(Object.keys(q.layout!)).toEqual(p.nodes.map((n) => n.id))
  })
})

describe('存檔格式 v2：原圖只留在專案檔', () => {
  it('專案檔保留 Scene 的來源與版面；匯出的 HTML 兩者都不含', () => {
    const p = newProject()
    const file = encodeProject(p)
    expect((file.nodes[1] as { source?: unknown }).source).toBeDefined()
    expect(file.layout).toBeDefined()

    const exported = extractProjectFile(buildHtml(p)) as { nodes: { source?: unknown }[]; layout?: unknown }
    expect(exported.nodes.every((n) => n.source === undefined)).toBe(true)
    // Start／End 的畫面也一樣（新專案的結尾預設就有畫面）
    expect((file.nodes[2] as { screen?: { source?: unknown } }).screen?.source).toBeDefined()
    expect((exported.nodes[2] as { screen?: { source?: unknown } }).screen?.source).toBeUndefined()
    expect(exported.layout).toBeUndefined()
  })

  it('存了再讀回來，來源與版面不變', () => {
    const p = newProject()
    const back = decodeProject(JSON.parse(JSON.stringify(encodeProject(p))))
    expect(find<SceneNode>(back, 'scene-1').source).toEqual(find<SceneNode>(p, 'scene-1').source)
    expect(back.layout).toEqual(p.layout)
  })

  it('舊的 v1 檔案（M2 匯出的）打得開', () => {
    const file = encodeProject(newProject(), { forExport: true })
    const v1 = { ...file, version: 1 }
    const back = decodeProject(JSON.parse(JSON.stringify(v1)))
    expect(back.nodes.map((n) => n.id)).toEqual(['start', 'scene-1', 'end-1'])
    expect(find<SceneNode>(back, 'scene-1').source).toBeUndefined()
  })
})

describe('新 node 的位置', () => {
  it('位置被佔了就往下找空位，不會疊在既有的 node 上', () => {
    const p = newProject()
    const at = p.layout!['scene-1']
    const spot = freeSpot(p, at)
    expect(spot.x).toBe(at.x)
    expect(spot.y).toBeGreaterThan(at.y)
    const { project, id } = addNode(p, 'end', at)
    expect(project.layout![id]).toEqual(spot)
  })

  it('空的地方就放原位', () => {
    const p = newProject()
    expect(freeSpot(p, { x: 2000, y: 2000 })).toEqual({ x: 2000, y: 2000 })
  })
})
