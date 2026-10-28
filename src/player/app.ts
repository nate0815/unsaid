/* 播放器的外殼：起始畫面、Scene 推進、Choice 疊加、End 與重看。規格見 DESIGN「播放器呈現」「Node 種類」。
 *
 * 匯出檔與編輯器預覽都跑這一份（PLAN「核心判斷」）。**零相依**：只能用 core 與 player。
 * 所有 DOM 與樣式都由這裡自己建，匯出範本只要給一個空的 <body>。 */

import { FONT_FAMILY } from '../core/glyph'
import { emptyGrid, stillClip, type Clip } from '../core/grid'
import type { ChoiceNode, EndNode, Project, SceneNode, SceneStyle, Screen } from '../core/project'
import { Flow, type Step } from './flow'
import { ScenePlayer } from './scene-player'

const DEFAULT_STYLE: SceneStyle = { fg: '#f1e7d8', bg: '#0b0b0d', useColors: false }
/** 自動推進／提示的檢查間隔。不必每幀檢查。 */
const POLL_MS = 100

const CSS = `
.u-root{position:fixed;inset:0;overflow:hidden;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
  font-family:${FONT_FAMILY};user-select:none;-webkit-user-select:none;cursor:pointer}
.u-stage{position:absolute;inset:0;display:grid;place-items:center;padding:16px;box-sizing:border-box}
.u-stage canvas{display:block}
.u-dim{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .4s;pointer-events:none}
.u-root.choosing .u-dim{opacity:.6}
.u-panel{position:absolute;left:0;right:0;bottom:0;padding:24px 16px calc(24px + env(safe-area-inset-bottom));
  display:none;flex-direction:column;align-items:center;gap:16px;cursor:default}
.u-root.choosing .u-choice,.u-root.ended .u-end{display:flex}
.u-prompt{margin:0;font-size:clamp(16px,4.2vw,24px);text-align:center;line-height:1.5;white-space:pre-wrap}
.u-options{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;max-width:720px}
.u-btn{font:inherit;font-size:clamp(15px,3.8vw,19px);background:transparent;color:inherit;
  border:1px solid currentColor;border-radius:6px;padding:10px 18px;cursor:pointer;opacity:.85}
.u-btn:hover,.u-btn:focus-visible{opacity:1;outline:none;background:rgb(255 255 255 / .12)}
.u-btn .u-key{opacity:.55;margin-right:.6em}
.u-start{position:absolute;inset:0;display:grid;place-items:center;border:0;background:transparent;
  color:inherit;font:inherit;font-size:clamp(16px,4vw,22px);letter-spacing:.2em;cursor:pointer}
.u-start span{animation:u-breathe 2.4s ease-in-out infinite}
.u-start.has-screen{place-items:end center;padding-bottom:calc(28px + env(safe-area-inset-bottom));font-size:clamp(13px,3.2vw,16px)}
/* 有設 display 的元素，hidden 屬性會被蓋掉 —— 一律補這條，否則「點一下開始」會一直留在畫面上。 */
.u-root [hidden]{display:none!important}
.u-hint{position:absolute;right:20px;bottom:calc(16px + env(safe-area-inset-bottom));opacity:0;transition:opacity .4s;
  pointer-events:none;font-size:14px}
.u-root.can-advance .u-hint{opacity:.6;animation:u-breathe 1.6s ease-in-out infinite}
@keyframes u-breathe{0%,100%{opacity:.35}50%{opacity:.9}}
.u-error{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#e8e6e3;background:#0b0b0d}
`

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text) e.textContent = text
  return e
}

/** 沒有畫面時（Start／End 沒設、Choice 前面沒有 Scene）用的空白畫面。 */
const BLANK: Clip = stillClip(emptyGrid(40, 20))

export function mountPlayer(host: HTMLElement, project: Project): void {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const root = h('div', 'u-root')
  const stage = h('div', 'u-stage')
  const canvas = document.createElement('canvas')
  stage.append(canvas)
  const dim = h('div', 'u-dim')
  const choice = h('div', 'u-panel u-choice')
  const prompt = h('p', 'u-prompt')
  const options = h('div', 'u-options')
  choice.append(prompt, options)
  const end = h('div', 'u-panel u-end')
  const replayBtn = h('button', 'u-btn', '重看')
  end.append(replayBtn)
  const hint = h('div', 'u-hint', '▼')
  const start = h('button', 'u-start')
  start.append(h('span', '', '點一下開始'))
  root.append(stage, dim, choice, end, hint, start)
  host.append(root)

  const player = new ScenePlayer(canvas, () => ({
    width: stage.clientWidth - 32,
    height: stage.clientHeight - 32,
  }))
  new ResizeObserver(() => player.resize()).observe(stage)

  const flow = new Flow(project)
  let step: Step | null = null
  let optionButtons: HTMLButtonElement[] = []

  const applyColors = (s: SceneStyle) => {
    root.style.background = s.bg
    root.style.color = s.fg
    document.documentElement.style.background = s.bg
  }
  applyColors(DEFAULT_STYLE)

  const setMode = (mode: 'start' | 'scene' | 'choice' | 'end') => {
    root.classList.toggle('choosing', mode === 'choice')
    root.classList.toggle('ended', mode === 'end')
    root.classList.remove('can-advance')
    start.hidden = mode !== 'start'
  }

  const show = (s: Step) => {
    step = s
    if (s.kind === 'scene') showScene(s.node)
    else if (s.kind === 'choice') showChoice(s.node)
    else showEnd(s.node)
  }

  const showScreen = (s: Screen) => {
    applyColors(s.style)
    player.show(s.layers[0] ?? BLANK, s.effects, s.style, true)
  }

  const showScene = (n: SceneNode) => {
    setMode('scene')
    showScreen(n)
  }

  const showChoice = (n: ChoiceNode) => {
    setMode('choice')
    if (flow.lastScene) {
      // 疊在上一個 Scene 上：停在當下那一格（DESIGN「Node 種類」）。
      player.pause()
    } else {
      player.show(BLANK, [], DEFAULT_STYLE, true)
    }
    prompt.textContent = n.prompt
    options.replaceChildren()
    optionButtons = n.options.map((o, i) => {
      const b = h('button', 'u-btn')
      b.append(h('span', 'u-key', String(i + 1)), o.label)
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        show(flow.choose(i))
      })
      options.append(b)
      return b
    })
    optionButtons[0]?.focus({ preventScroll: true })
  }

  const showEnd = (n: EndNode) => {
    setMode('end')
    if (n.screen) showScreen(n.screen)
    else {
      // 沒有結尾畫面：空白，背景沿用最後一個 Scene，畫面才不會突然換色。
      const s = flow.lastScene?.style ?? DEFAULT_STYLE
      applyColors(s)
      player.show(BLANK, [], s, true)
    }
    replayBtn.hidden = !n.replay
  }

  /** 點一下：進場特效還在跑就先播完；播完了才往下一個。自動推進的 Scene 不吃點擊推進。 */
  const tap = () => {
    if (!step) {
      show(flow.begin())
      return
    }
    if (step.kind !== 'scene') return
    if (player.elapsed() < player.enterDuration()) {
      player.seek(player.enterDuration())
      return
    }
    if (step.node.advance.mode === 'click') show(flow.advance())
  }

  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.u-panel')) return
    tap()
  })
  replayBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    show(flow.begin())
  })

  window.addEventListener('keydown', (e) => {
    if (step?.kind === 'choice') {
      const n = Number(e.key)
      if (n >= 1 && n <= optionButtons.length) {
        e.preventDefault()
        optionButtons[n - 1].click()
        return
      }
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
      if (dir) {
        e.preventDefault()
        const at = optionButtons.indexOf(document.activeElement as HTMLButtonElement)
        optionButtons[(at + dir + optionButtons.length) % optionButtons.length]?.focus()
      }
      return // Enter／空白鍵交給被 focus 的按鈕自己處理
    }
    if (e.key === ' ' || e.key === 'Enter') {
      if (step?.kind === 'end') return
      e.preventDefault()
      tap()
    }
  })

  setInterval(() => {
    if (step?.kind !== 'scene') return
    const t = player.elapsed()
    const adv = step.node.advance
    if (adv.mode === 'auto') {
      if (t >= Math.max(adv.seconds, player.enterDuration())) show(flow.advance())
    } else {
      root.classList.toggle('can-advance', t >= player.enterDuration())
    }
  }, POLL_MS)

  // 起始畫面：Start 的畫面在背後播，「點一下開始」移到下方（DESIGN「播放器呈現」）。一定要點一下才往下。
  setMode('start')
  const startNode = project.nodes.find((n) => n.type === 'start')
  if (startNode?.type === 'start' && startNode.screen) {
    start.classList.add('has-screen')
    showScreen(startNode.screen)
  }
}

/** 載入失敗時在畫面上講清楚，而不是一片黑。 */
export function showError(host: HTMLElement, message: string): void {
  const e = h('div', 'u-error', message)
  host.append(e)
}
