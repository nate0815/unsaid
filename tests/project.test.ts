import { describe, expect, it } from 'vitest'
import { layoutText, toMessage } from '../src/core/convert'
import { findBrokenWide, stillClip, type Grid } from '../src/core/grid'
import {
  decodeClip,
  decodeGrid,
  decodeProject,
  encodeClip,
  encodeGrid,
  encodeProject,
  extractProjectFile,
  FORMAT_VERSION,
  jsonForScript,
  ProjectFormatError,
  validateProject,
  type Project,
  type SceneNode,
} from '../src/core/project'
import { Flow } from '../src/player/flow'

const cp = (n: number) => String.fromCodePoint(n)

function sameGrid(a: Grid, b: Grid) {
  expect([b.cols, b.rows]).toEqual([a.cols, a.rows])
  a.cells.forEach((c, i) => {
    const d = b.cells[i]
    const blankA = c.w !== 0 && (c.ch === ' ' || c.a <= 0)
    if (blankA) {
      expect(d.a === 0 || d.ch === ' ').toBe(true)
      return
    }
    expect([d.ch, d.w]).toEqual([c.ch, c.w])
    expect(d.a).toBeCloseTo(c.a, 2) // 存成 0～255，誤差 < 1/255
  })
}

const scene = (id: string, next: string | null, grid: Grid): SceneNode => ({
  id,
  type: 'scene',
  layers: [stillClip(grid)],
  style: { fg: '#fff', bg: '#000', useColors: false },
  effects: [],
  advance: { mode: 'click' },
  next,
})

function demo(): Project {
  const g = layoutText('有些話', 10)
  return {
    title: '測試',
    nodes: [
      { id: 'start', type: 'start', next: 's1' },
      scene('s1', 'c1', g),
      { id: 'c1', type: 'choice', prompt: '要聽嗎？', options: [{ label: '好', next: 's2' }, { label: '不要', next: 'e2' }] },
      scene('s2', 'e1', g),
      { id: 'e1', type: 'end', text: '謝謝', replay: true },
      { id: 'e2', type: 'end', text: '', replay: false },
    ],
  }
}

describe('字元格存檔', () => {
  it('中英混排的訊息填充（含透明度）存了再讀回來一模一樣，全形字仍成對', () => {
    const lum = Float32Array.from({ length: 23 * 7 }, (_, i) => ((i * 7919) % 17) / 16)
    const g = toMessage(lum, 23, 7, '有些話 I never said，謝謝你。', { threshold: 0.25, minAlpha: 0.3 })
    const back = decodeGrid(JSON.parse(JSON.stringify(encodeGrid(g))), 23, 7)
    expect(findBrokenWide(back)).toBe(-1)
    sameGrid(g, back)
  })

  it('全部不透明時不存 alpha；有顏色才存 colors', () => {
    const g = layoutText('abc', 5)
    expect(encodeGrid(g).alpha).toBeUndefined()
    expect(encodeGrid(g).colors).toBeUndefined()
    g.colors = new Uint8ClampedArray(15).fill(200)
    const back = decodeGrid(encodeGrid(g), 5, 1)
    expect(Array.from(back.colors!)).toEqual(Array.from(g.colors))
  })

  it('每列一個字串，全形字只寫一次', () => {
    // 「我a」佔 3 格，放進 4 欄：置中後左邊留 0 格、右邊留 1 格
    expect(encodeGrid(layoutText('我a', 4)).text).toEqual(['我a '])
  })

  it('動圖：格數與停留時間保留；靜態圖不存 delays', () => {
    const a = layoutText('甲', 4)
    const b = layoutText('乙', 4)
    const f = encodeClip({ frames: [a, b], delays: [120, 80] })
    expect(f.delays).toEqual([120, 80])
    const back = decodeClip(JSON.parse(JSON.stringify(f)))
    expect(back.delays).toEqual([120, 80])
    sameGrid(b, back.frames[1])
    expect(encodeClip(stillClip(a)).delays).toBeUndefined()
    expect(decodeClip(encodeClip(stillClip(a))).delays).toEqual([Infinity])
  })
})

describe('專案存檔', () => {
  it('整個專案存了再讀回來，結構不變', () => {
    const p = demo()
    const back = decodeProject(JSON.parse(JSON.stringify(encodeProject(p))))
    expect(back.nodes.map((n) => [n.id, n.type])).toEqual(p.nodes.map((n) => [n.id, n.type]))
    sameGrid((p.nodes[1] as SceneNode).layers[0].frames[0], (back.nodes[1] as SceneNode).layers[0].frames[0])
  })

  it('帶格式名、版本號與字元格比例', () => {
    const f = encodeProject(demo())
    expect([f.format, f.version, f.cellAspect]).toEqual(['unsaid', FORMAT_VERSION, 2])
  })

  it('不是專案檔、或比這版新的檔案，給看得懂的錯誤', () => {
    expect(() => decodeProject({ hello: 1 })).toThrow(ProjectFormatError)
    expect(() => decodeProject({ ...encodeProject(demo()), version: FORMAT_VERSION + 1 })).toThrow(/較新的版本/)
  })
})

describe('驗證：沒接好的地方要指出來', () => {
  it('完整的專案沒有問題', () => {
    expect(validateProject(demo())).toEqual([])
  })

  it('抓得到：沒有 Start、出口沒接、接到不存在的 node、選項太少、id 重複', () => {
    const p = demo()
    p.nodes = p.nodes.filter((n) => n.type !== 'start')
    ;(p.nodes[0] as SceneNode).next = null
    const c = p.nodes[1]
    if (c.type === 'choice') c.options = [{ label: '只有一個', next: 'nowhere' }]
    p.nodes.push({ id: 'e1', type: 'end', text: '', replay: false })
    const msgs = validateProject(p).map((x) => x.message)
    expect(msgs.some((m) => m.includes('Start 必須恰好一個'))).toBe(true)
    expect(msgs.some((m) => m.includes('出口沒有接到'))).toBe(true)
    expect(msgs.some((m) => m.includes('不存在的 node：nowhere'))).toBe(true)
    expect(msgs.some((m) => m.includes('選項要 2～8 個'))).toBe(true)
    expect(msgs.some((m) => m.includes('id 重複'))).toBe(true)
  })
})

describe('匯出 HTML 裡的專案資料', () => {
  it('訊息裡有 </script> 也不會讓 HTML 斷掉，而且取得回來', () => {
    const p = demo()
    const end = p.nodes.find((n) => n.type === 'end')!
    if (end.type === 'end') end.text = '</script><b>嗨</b>' + cp(0x2028) + '下一行'
    const json = jsonForScript(encodeProject(p))
    expect(json.includes('</script')).toBe(false)
    expect(json.includes(cp(0x2028))).toBe(false)
    const html = `<html><body><script type="application/json" id="unsaid-data">${json}</script><script>x()</script></body></html>`
    const back = decodeProject(extractProjectFile(html))
    const e = back.nodes.find((n) => n.type === 'end')
    expect(e && e.type === 'end' && e.text).toBe('</script><b>嗨</b>' + cp(0x2028) + '下一行')
  })

  it('不是匯出檔就回傳 null', () => {
    expect(extractProjectFile('<html>nothing</html>')).toBeNull()
  })
})

describe('Flow：流程推進', () => {
  it('Start → Scene → Choice → 選第一個 → Scene → End；重看回到第一個 Scene', () => {
    const f = new Flow(demo())
    expect(f.begin().node.id).toBe('s1')
    expect(f.advance().node.id).toBe('c1')
    expect(f.lastScene?.id).toBe('s1') // Choice 要疊在 s1 上
    expect(f.choose(0).node.id).toBe('s2')
    expect(f.advance().node.id).toBe('e1')
    expect(f.begin().node.id).toBe('s1')
  })

  it('選第二個走另一條路；超出範圍的選項不動', () => {
    const f = new Flow(demo())
    f.begin()
    f.advance()
    expect(f.choose(5).node.id).toBe('c1')
    expect(f.choose(1).node.id).toBe('e2')
  })

  it('壞掉的連結走到 End，不會當掉；Start 指向自己也不會無限迴圈', () => {
    const p = demo()
    ;(p.nodes[1] as SceneNode).next = 'nowhere'
    const f = new Flow(p)
    f.begin()
    expect(f.advance().kind).toBe('end')
    const loop: Project = { title: '', nodes: [{ id: 'start', type: 'start', next: 'start' }] }
    expect(new Flow(loop).begin().kind).toBe('end')
  })

  it('Start 直接接 Choice：沒有可以疊的 Scene', () => {
    const p = demo()
    p.nodes[0] = { id: 'start', type: 'start', next: 'c1' }
    const f = new Flow(p)
    expect(f.begin().kind).toBe('choice')
    expect(f.lastScene).toBeNull()
  })
})
