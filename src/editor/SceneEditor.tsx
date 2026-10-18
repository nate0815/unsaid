/* Scene 編輯畫面：在流程圖上雙擊 Scene 打開。左邊是大的即時預覽（同一個播放器，含特效），右邊是參數。
 * 參數與屬性面板是同一組元件 —— 兩邊改的是同一份資料，不會分岔。 */

import { useEffect, useRef } from 'react'
import type { SceneNode } from '../core/project'
import { ScenePlayer } from '../player/scene-player'
import { SceneInspector } from './Inspector'

export function SceneEditor({ node, patch, onClose }: { node: SceneNode; patch: (fn: (n: SceneNode) => SceneNode) => void; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const player = useRef<ScenePlayer | null>(null)

  useEffect(() => {
    const p = new ScenePlayer(canvas.current!, () => ({ width: stage.current!.clientWidth - 32, height: stage.current!.clientHeight - 32 }))
    player.current = p
    const ro = new ResizeObserver(() => p.resize())
    ro.observe(stage.current!)
    return () => {
      ro.disconnect()
      p.stop()
    }
  }, [])

  // 特效一換就從頭播，看得到進場；只改轉換參數或顏色時沿用時間，拉拉桿時進場特效不會一直重播。
  const effectsKey = JSON.stringify(node.effects)
  const lastEffects = useRef<string | null>(null)
  const layer = node.layers[0]
  useEffect(() => {
    if (!player.current || !layer) return
    player.current.show(layer, node.effects, node.style, lastEffects.current !== effectsKey)
    lastEffects.current = effectsKey
  }, [layer, node.style, effectsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="scene-editor" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="scene-editor-box">
        <div className="scene-editor-stage" ref={stage} style={{ background: node.style.bg }} onClick={() => player.current?.replay()} title="點一下重播">
          <canvas ref={canvas} />
        </div>
        <aside className="inspector scene-editor-side">
          <h2>編輯 Scene</h2>
          <SceneInspector node={node} patch={patch} hideThumb />
          <div className="scene-editor-actions">
            <button onClick={() => player.current?.replay()}>重播</button>
            <button className="primary" onClick={onClose}>完成（Esc）</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
