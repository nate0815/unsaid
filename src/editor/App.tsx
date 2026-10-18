/* 流程編輯器（M3）。規格見 DESIGN「系統元件」「Node 種類」「專案存檔」。
 *
 * 狀態只有一份：`Project`（執行期格式，圖層是轉好的 Clip）。畫布、屬性面板、預覽、匯出都從它推出來。
 * Scene 的 `source`（原圖＋參數）一變，就在背景重新轉換、把結果寫回 `layers`。 */

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canvasInkMeasure } from '../core/ink'
import {
  decodeProject,
  encodeProject,
  extractProjectFile,
  validateProject,
  type FlowNode,
  type Project,
  type SceneSource,
} from '../core/project'
import { buildHtml } from '../media/export-html'
import { renderSource } from '../media/render-source'
import {
  addNode,
  addOption,
  canConnect,
  connect,
  disconnect,
  edges as projectEdges,
  ensureLayout,
  moveNode,
  newProject,
  removeNodes,
  updateNode,
  type AddableType,
} from './graph'
import { Inspector } from './Inspector'
import { nodeTypes, type RFNode } from './nodes'
import { SceneEditor } from './SceneEditor'
import { backupBroken, loadAutosave, saveAutosave } from './storage'

const AUTOSAVE_MS = 500
const RERENDER_MS = 120

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const safeName = (s: string) => (s.trim() || 'unsaid').replace(/[\\/:*?"<>|]/g, '_')

/** 預覽 = 匯出的 HTML 本身放進 iframe（TECH「不變式」）。 */
function Preview({ html, onClose }: { html: string; onClose: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="preview">
      <iframe ref={ref} title="預覽" sandbox="allow-scripts" srcDoc={html} onLoad={() => ref.current?.focus()} />
      <button onClick={onClose}>關閉預覽（Esc）</button>
    </div>
  )
}

function Editor({ initial }: { initial: Project }) {
  const [project, setProject] = useState(initial)
  const [selected, setSelected] = useState<string | null>(null)
  /** 雙擊打開的 Scene 編輯畫面（DESIGN「系統元件」的 Scene 編輯面板）。 */
  const [editing, setEditing] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const flow = useReactFlow()
  const measure = useMemo(canvasInkMeasure, [])
  const importRef = useRef<HTMLInputElement>(null)

  /* ── Scene 來源一變就重新轉換 ── */
  // 已經轉換過（或正在轉換）的 source 物件。source 是不可變的：一改就是新物件，所以用物件身分比對就夠。
  const rendered = useRef(new WeakSet<SceneSource>())
  useEffect(() => {
    for (const n of initial.nodes) if (n.type === 'scene' && n.source) rendered.current.add(n.source)
  }, [initial])
  useEffect(() => {
    const todo = project.nodes.filter((n) => n.type === 'scene' && n.source && !rendered.current.has(n.source))
    if (todo.length === 0) return
    const timer = setTimeout(() => {
      for (const n of todo) {
        if (n.type !== 'scene' || !n.source) continue
        const src = n.source
        rendered.current.add(src)
        renderSource(src, measure)
          .then((clip) =>
            // 轉換是非同步的：回來時若使用者又改了參數，丟掉這次的結果。
            setProject((p) => updateNode(p, n.id, (x: FlowNode) => (x.type === 'scene' && x.source === src ? { ...x, layers: [clip] } : x)))
          )
          .catch((e) => setStatus(`轉換失敗：${e instanceof Error ? e.message : e}`))
      }
    }, RERENDER_MS)
    return () => clearTimeout(timer)
  }, [project, measure])

  /* ── 自動存檔 ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      saveAutosave(encodeProject(project))
        .then(() => setStatus(`已自動存檔 ${new Date().toLocaleTimeString()}`))
        .catch((e) => setStatus(`自動存檔失敗：${e instanceof Error ? e.message : e}`))
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [project])

  /* ── 驗證：沒接好的地方標紅、匯出擋下（DESIGN「Node 種類」） ── */
  const problems = useMemo(() => validateProject(project), [project])
  const problemNodes = useMemo(() => new Set(problems.map((p) => p.node).filter(Boolean)), [problems])

  /* ── 專案 ⇄ React Flow ── */
  // React Flow 量好的 node 尺寸。每次重繪都要帶回去：少了 `measured`，React Flow 會把 node 當成沒量過，
  // 先隱藏、再重量一次 —— 拖曳時每一格都這樣，畫面就會閃（TECH「不變式」）。
  const measured = useRef(new Map<string, { width: number; height: number }>())
  const rfNodes: RFNode[] = project.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: project.layout?.[n.id] ?? { x: 0, y: 0 },
    measured: measured.current.get(n.id),
    data: { node: n, problem: problemNodes.has(n.id), onAddOption: n.type === 'choice' ? () => setProject((p) => updateNode(p, n.id, addOption)) : undefined },
    selected: n.id === selected,
    deletable: n.type !== 'start',
  }))
  const rfEdges = projectEdges(project).map((e) => ({ ...e, selected: false }))

  const onNodesChange = useCallback((changes: NodeChange<RFNode>[]) => {
    for (const c of changes) {
      if (c.type === 'dimensions' && c.dimensions) measured.current.set(c.id, c.dimensions)
      if (c.type === 'remove') measured.current.delete(c.id)
    }
    const moves = changes.flatMap((c) => (c.type === 'position' && c.position ? [{ id: c.id, pos: c.position }] : []))
    const removed = changes.flatMap((c) => (c.type === 'remove' ? [c.id] : []))
    if (moves.length || removed.length) {
      setProject((p) => {
        let next = p
        for (const m of moves) next = moveNode(next, m.id, m.pos)
        return removed.length ? removeNodes(next, removed) : next
      })
    }
    for (const c of changes) if (c.type === 'select') setSelected((s) => (c.selected ? c.id : s === c.id ? null : s))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) {
      if (c.type !== 'remove') continue
      const [source, handle] = c.id.split(':')
      setProject((p) => disconnect(p, source, handle))
    }
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) setProject((p) => connect(p, c.source!, c.sourceHandle ?? 'out', c.target!))
  }, [])

  const isValidConnection = useCallback((c: Connection | { source: string; target: string }) => canConnect(project, c.source!, c.target!), [project])

  /* ── 工具列 ── */
  /** 新 node 放在選取中的 node 右邊（順著流程往下接）；沒選就放畫面中央。被佔了 addNode 會往下找空位。 */
  const add = (type: AddableType) => {
    const anchor = selected ? project.layout?.[selected] : undefined
    const box = document.querySelector('.canvas')!.getBoundingClientRect()
    const pos = anchor
      ? { x: anchor.x + 280, y: anchor.y }
      : flow.screenToFlowPosition({ x: box.left + box.width / 2 - 90, y: box.top + box.height / 2 - 60 })
    const { project: p, id } = addNode(project, type, pos)
    setProject(p)
    setSelected(id)
  }

  const exportHtml = () => {
    if (problems.length) return setStatus('還不能匯出：先把標紅的地方接好')
    const html = buildHtml(project)
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(project.title)}.html`)
    setStatus(`已匯出 HTML（${(new Blob([html]).size / 1024).toFixed(0)} KB）`)
  }

  const importFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const text = await f.text()
      const raw = /\.json$/i.test(f.name) ? JSON.parse(text) : extractProjectFile(text)
      if (!raw) throw new Error('這個檔案裡找不到 Unsaid 的訊息資料')
      if (!confirm('匯入會取代目前的訊息（目前的會被覆蓋）。要繼續嗎？')) return
      const p = ensureLayout(decodeProject(raw))
      for (const n of p.nodes) if (n.type === 'scene' && n.source) rendered.current.add(n.source)
      setProject(p)
      setSelected(null)
      setStatus(`已匯入「${f.name}」`)
      setTimeout(() => flow.fitView({ padding: 0.2 }), 50)
    } catch (e) {
      setStatus(`匯入失敗：${e instanceof Error ? e.message : e}`)
    }
  }

  const reset = () => {
    if (!confirm('開一則新的訊息？目前的內容會被清掉（要留著就先「下載專案」）。')) return
    const p = newProject()
    for (const n of p.nodes) if (n.type === 'scene' && n.source) rendered.current.add(n.source)
    setProject(p)
    setSelected(null)
    setTimeout(() => flow.fitView({ padding: 0.2 }), 50)
  }

  const selectedNode = project.nodes.find((n) => n.id === selected) ?? null
  const patch = (fn: (n: FlowNode) => FlowNode) => selected && setProject((p) => updateNode(p, selected, fn))
  const editingNode = project.nodes.find((n) => n.id === editing) ?? null

  return (
    <div className="editor">
      <header className="toolbar">
        <input className="title" value={project.title} onChange={(e) => setProject((p) => ({ ...p, title: e.target.value }))} title="訊息標題（也是匯出檔的分頁標題）" />
        <div className="group">
          <button onClick={() => add('scene')}>＋ Scene</button>
          <button onClick={() => add('choice')}>＋ Choice</button>
          <button onClick={() => add('end')}>＋ 結尾</button>
        </div>
        <div className="group">
          <button className="primary" onClick={() => setPreview(buildHtml(project))}>預覽</button>
          <button onClick={exportHtml} disabled={problems.length > 0} title={problems.length ? '先把標紅的地方接好' : ''}>
            匯出 HTML
          </button>
        </div>
        <div className="group">
          <button onClick={() => download(new Blob([JSON.stringify(encodeProject(project))], { type: 'application/json' }), `${safeName(project.title)}.json`)}>下載專案</button>
          <button onClick={() => importRef.current?.click()}>匯入…</button>
          <button onClick={reset}>新訊息</button>
          <input ref={importRef} type="file" accept=".json,.html" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        </div>
        <a className="link" href="./spike.html">Scene 工作室（試作）↗</a>
      </header>

      <main className="canvas">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onPaneClick={() => setSelected(null)}
          onNodeDoubleClick={(_, n) => n.type === 'scene' && setEditing(n.id)}
          zoomOnDoubleClick={false}
          deleteKeyCode={['Delete', 'Backspace']}
          defaultEdgeOptions={{ animated: true }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: false }}
          colorMode="dark"
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </main>

      <Inspector node={selectedNode} problems={problems.filter((p) => p.node === selected).map((p) => p.message)} patch={patch} />

      <footer className="statusbar">
        {problems.length ? (
          <span className="problems">
            ⚠ {problems.length} 個地方還沒接好：
            {problems.map((p, i) => (
              <button key={i} className="problem" onClick={() => p.node && setSelected(p.node)}>
                {p.message}
              </button>
            ))}
          </span>
        ) : (
          <span className="ok">✓ 流程都接好了，可以匯出</span>
        )}
        <span className="saved">{status}</span>
      </footer>

      {preview && <Preview html={preview} onClose={() => setPreview(null)} />}
      {editingNode?.type === 'scene' && (
        <SceneEditor node={editingNode} patch={(fn) => setProject((p) => updateNode(p, editingNode.id, fn))} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

export function App() {
  const [initial, setInitial] = useState<Project | null>(null)
  useEffect(() => {
    loadAutosave().then(async (raw) => {
      try {
        setInitial(raw ? ensureLayout(decodeProject(raw)) : newProject())
      } catch (e) {
        console.error('自動存檔讀不回來，已另存備份', e)
        await backupBroken(raw)
        setInitial(newProject())
      }
    })
  }, [])
  if (!initial) return <div className="loading">載入中…</div>
  return (
    <ReactFlowProvider>
      <Editor initial={initial} />
    </ReactFlowProvider>
  )
}
