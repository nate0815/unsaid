/* 字元畫面的縮圖：用正式的 Renderer 畫第一格（不套特效）。流程圖上的 Scene node 與屬性面板都用它。 */

import { useEffect, useRef } from 'react'
import type { Grid } from '../core/grid'
import type { SceneStyle } from '../core/project'
import { SceneFrames } from '../player/effects'
import { Renderer } from '../player/renderer'

export function Thumb({ grid, style, width, height }: { grid: Grid; style: SceneStyle; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const r = new Renderer(canvas)
    r.setGrid(grid)
    r.setStyle(style)
    r.fit(width, height)
    r.draw(new SceneFrames(grid, []).frame(0))
  }, [grid, style, width, height])
  return <canvas ref={ref} className="thumb" />
}
