/* M2 的示範訊息：第一個 Scene 用 spike 目前的畫面，後面接一段固定的流程。
 * 有 Choice、兩條路、一個動圖圖層 —— 走完它就驗證得了 H2（DESIGN「要驗證的假設」）。
 * M3 有流程編輯器之後，這支就不需要了。 */

import { layoutText, sampleImage, toMessage } from '../core/convert'
import { emptyGrid, stillClip, type Clip, type Grid } from '../core/grid'
import type { EffectSpec, Project, SceneNode, SceneStyle } from '../core/project'

/** 畫一顆帶漸層的心。`scale` 讓示範動圖可以「跳動」。 */
export function drawHeart(scale = 1): HTMLCanvasElement {
  const w = 480
  const h = 420
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const glow = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6)
  glow.addColorStop(0, '#3a1420')
  glow.addColorStop(1, '#000')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h * 0.52)
  ctx.scale(scale, scale)
  ctx.translate(0, -h * 0.22)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-30, -80, -200, -60, -170, 60)
  ctx.bezierCurveTo(-150, 140, -40, 200, 0, 260)
  ctx.bezierCurveTo(40, 200, 150, 140, 170, 60)
  ctx.bezierCurveTo(200, -60, 30, -80, 0, 0)
  const fill = ctx.createLinearGradient(-170, -60, 170, 260)
  fill.addColorStop(0, '#ffd1dc')
  fill.addColorStop(0.5, '#ff5a7a')
  fill.addColorStop(1, '#9b1236')
  ctx.fillStyle = fill
  ctx.fill()
  ctx.restore()
  return c
}

/** 跳動的心：12 格、每格 90 ms，用訊息填充模式填「謝謝你」。 */
function beatingHeart(): Clip {
  const N = 12
  const frames: Grid[] = []
  for (let i = 0; i < N; i++) {
    const beat = Math.max(0, Math.sin((i / N) * Math.PI * 2)) ** 2
    const img = drawHeart(0.82 + 0.14 * beat)
    const s = sampleImage(img, img.width, img.height, 64)
    const g = toMessage(s.lum, s.cols, s.rows, '謝謝你', { threshold: 0.22, minAlpha: 0.35 })
    g.colors = s.rgb
    frames.push(g)
  }
  return { frames, delays: frames.map(() => 90) }
}

function textClip(text: string, cols = 32): Clip {
  const body = layoutText(text, cols)
  const grid = emptyGrid(cols, body.rows + 4)
  grid.cells.splice(cols * 2, body.cells.length, ...body.cells)
  return stillClip(grid)
}

export interface FirstScene {
  clip: Clip
  effects: EffectSpec[]
  style: SceneStyle
}

export function buildDemo(first: FirstScene): Project {
  const plain: SceneStyle = { fg: first.style.fg, bg: first.style.bg, useColors: false }
  const scene = (id: string, next: string, clip: Clip, effects: EffectSpec[], style: SceneStyle): SceneNode => ({
    id,
    type: 'scene',
    layers: [clip],
    style,
    effects,
    advance: { mode: 'click' },
    next,
  })
  return {
    title: '有些話',
    nodes: [
      { id: 'start', type: 'start', next: 's1' },
      scene('s1', 'c1', first.clip, first.effects, first.style),
      {
        id: 'c1',
        type: 'choice',
        prompt: '你願意聽我說完嗎？',
        options: [
          { label: '好', next: 's2' },
          { label: '下次吧', next: 'e2' },
        ],
      },
      scene('s2', 's3', textClip('那就好。\n\n其實我一直想說的是——'), [{ kind: 'decode', speed: 1, intensity: 0.8 }], plain),
      scene('s3', 'e1', beatingHeart(), [{ kind: 'wave', speed: 0.6, intensity: 0.25 }], { ...first.style, useColors: true }),
      { id: 'e1', type: 'end', text: '謝謝你看完。', replay: true },
      { id: 'e2', type: 'end', text: '沒關係。\n等你準備好，再打開一次。', replay: true },
    ],
  }
}
