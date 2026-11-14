// Renders every overlay the game can show, from real runs, into one page. Seeing these is otherwise expensive: each one is fifteen to twenty exchanges of deliberately turning your head the same way in front of a webcam, and the three endings are mutually exclusive, so a single session can only ever show you one of them. This plays simulated sessions until each state is reached and then asks `panelFor` for exactly the markup the game would show, inside exactly the stylesheet the game ships, so what comes out is the screen and not a mock-up of it. Run: npm run panels, then open dist/panels.html

import { readFileSync, writeFileSync } from 'node:fs'
import { DIRECTIONS_ORDER, type Mode } from '../src/game.ts'
import { mark } from '../src/marks.ts'
import { menuFor, panelFor, readLine, tallyLine } from '../src/panel.ts'
import { Predictor } from '../src/predictor.ts'
import { Run } from '../src/run.ts'
import type { Direction } from '../src/reader.ts'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

type Behaviour = (past: readonly Direction[], r: () => number) => Direction

// Plays until the run is in the state asked for, or gives up. `after` is what the player does once the reveal has fired, which is the only lever that decides which ending they get.
function reach(
  want: 'reveal' | 'comeback' | 'bounced' | 'never-read' | 'still-read',
  seed: number,
  before: Behaviour,
  after: Behaviour,
  mode: Mode = 'normal',
): Run | null {
  const r = rng(seed)
  const predictor = new Predictor()
  // Impossible mode skips the warm stage, exactly as main.ts starts it.
  const run = new Run(mode === 'impossible')
  let caught = false
  for (let i = 0; i < 400; i++) {
    if (run.stage === 'reveal') {
      if (want === 'reveal') return run
      caught = true
      run.acknowledge()
      continue
    }
    if (want === 'comeback' && run.stage === 'comeback' && run.comebackLength >= 3) return run
    if (run.stage === 'done') return run.ending === want ? run : null
    const choice = (caught ? after : before)(run.choices, r)
    // In impossible mode it points where you point, so the exchange is lost before it starts. That is the whole reason the comeback is measured on the read rather than on wins.
    const machine = mode === 'impossible'
      ? choice
      : run.steering ? predictor.choose(r) : DIRECTIONS_ORDER[Math.floor(r() * 4)]!
    const won = mode === 'impossible' ? false : machine === choice
    predictor.observe(choice, won)
    run.observe(choice, won, predictor.confidence)
  }
  return null
}

const free: Behaviour = (_p, r) => DIRECTIONS_ORDER[Math.floor(r() * 4)]!
const alternating: Behaviour = (p) => (p[p.length - 1] === 'left' ? 'right' : 'left')
const leftHeavy: Behaviour = (p, r) => {
  const open = DIRECTIONS_ORDER.filter((d) => d !== p[p.length - 1])
  return r() < 0.55 ? 'left' : open[Math.floor(r() * open.length)]!
}

/** Seeds are searched rather than chosen, because most do not land. */
function find(
  want: 'reveal' | 'comeback' | 'bounced' | 'never-read' | 'still-read',
  before: Behaviour,
  after: Behaviour,
  mode: Mode = 'normal',
): Run {
  for (let seed = 1; seed < 4000; seed++) {
    const run = reach(want, seed * 7919, before, after, mode)
    if (run) return run
  }
  throw new Error(`no run reached ${want}, which is itself the finding`)
}

const states: { label: string; run: Run; mode: Mode }[] = [
  { label: 'caught', run: find('reveal', alternating, free), mode: 'normal' },
  { label: 'bounced back', run: find('bounced', alternating, free), mode: 'normal' },
  { label: 'still read', run: find('still-read', alternating, alternating), mode: 'normal' },
  { label: 'never read', run: find('never-read', free, free), mode: 'normal' },
  // The copy that must never imply the player won an exchange, because in this mode they cannot.
  { label: 'impossible: caught', run: find('reveal', alternating, free, 'impossible'), mode: 'impossible' },
  { label: 'impossible: bounced back', run: find('bounced', alternating, free, 'impossible'), mode: 'impossible' },
]

// The real stylesheet, lifted out of the real page, so a change to the game's CSS shows up here instead of this quietly drifting into its own look.
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const style = page.slice(page.indexOf('<style>'), page.indexOf('</style>') + 8)

// The four directions, drawn by the game's own `mark`, inside the game's own stage markup. The thing being looked at is whether the glyph and the side it sits on say the same thing, which is the mistake this file has shipped once.
const marks = (['left', 'right', 'up', 'down'] as const)
  .map((d) => {
    const m = mark(d, 'face')
    return `<div class="stagebox"><div id="hand" class="${m.className}">${m.html}</div>` +
      `<span class="label">${d}</span></div>`
  })
  .join('')

// The readout, from the real builder, at each stage it can be in.
const readoutStates: { label: string; run: Run; mode: Mode }[] = [
  { label: 'warm', run: new Run(false), mode: 'normal' },
  { label: 'read', run: states[0]!.run, mode: 'normal' },
  { label: 'impossible, read', run: states[4]!.run, mode: 'impossible' },
  { label: 'comeback', run: find('comeback', alternating, free), mode: 'normal' },
  { label: 'done', run: states[1]!.run, mode: 'normal' },
]
const readouts = readoutStates
  .map(({ label, run, mode }) => {
    const l = readLine(run, mode)
    return `<div class="box"><div id="hud">` +
      `<div id="arc">${l.arc}</div>` +
      `<div id="read" class="${l.hot ? 'hot' : ''}">${l.value}<span class="unit"> ${l.unit}</span></div>` +
      `<div id="tally">${tallyLine(mode, 14, 3, 0, 142)}</div>` +
      `<div id="diag" style="display:block">tracked · 11ms · turn 7deg · 1 void · 42 yours · 980 pooled</div>` +
      `</div><span class="label">${label}</span></div>`
  })
  .join('')

const menus = [0, 42]
  .map((n) => `<div class="box wide"><div id="msg">${menuFor(n)}</div>` +
    `<span class="label">${n === 0 ? 'first player' : 'after a run'}</span></div>`)
  .join('')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Hoi overlays</title>
${style}
<style>
  /* Harness only: the real overlay covers the screen, so they are laid out
     side by side here and the fixed positioning is undone. */
  body { display: block; overflow: auto; padding: 28px; }
  h2 { font: inherit; color: var(--dim); letter-spacing: .14em; text-transform: uppercase; font-size: 11px; margin: 26px 0 10px; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); }
  #panel, .case > div:first-child { position: static; display: block; padding: 0; background: none; }
  .marks { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
  .stagebox { max-width: 100%; }
  .readouts, .menus { display: grid; gap: 12px; margin-bottom: 10px;
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); }
  .box { position: relative; min-width: 0; padding: 18px 18px 30px; border: 1px solid var(--line); border-radius: 10px; background: #0e1117; }
  .box.wide { flex: 1 1 100%; }
  /* The real readout is fixed to the viewport and capped against it. Inside a
     padded harness box that cap is wrong and made the lines look like they
     overflow when the shipping page is fine, so it is re-capped to the box. */
  .box #hud, .box #msg { position: static; max-width: 100%; }
  .box #msg { text-align: center; }
  .stagebox { position: relative; width: 210px; aspect-ratio: 4 / 3; border: 1px solid var(--line); border-radius: 10px; background: #15181e; }
  .stagebox #hand { position: absolute; font-size: 64px; }
  .stagebox #hand svg { width: 54px; }
  .label { position: absolute; bottom: 6px; left: 8px; color: var(--dim); font-size: 11px; }
</style>
</head><body>
<h2>the readout, every stage</h2>
<div class="readouts">${readouts}</div>
<h2>the start screen, first player and handover</h2>
<div class="menus">${menus}</div>
<h2>the machine's head, four ways</h2>
<div class="marks">${marks}</div>
<div class="grid">
${states.map((s) => `<div class="case"><h2>${s.label}</h2><div id="panel" class="show"><div>${panelFor(s.run, s.mode)}</div></div></div>`).join('\n')}
</div>
</body></html>
`

writeFileSync(new URL('../dist/panels.html', import.meta.url), html)
console.log('wrote dist/panels.html')
for (const s of states) {
  console.log(`\n${s.label}: ${s.run.played} played, peak ${Math.round(s.run.peak * 100)}%`)
  console.log(`  ${s.run.caughtBy?.text ?? '(no habit named)'}`)
}
