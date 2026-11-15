// How to play: an animated demo of one dodge and one hit, with captions. Every frame is worked out from the time alone.
import { heroHtml, paintHero, type Face, type Look } from './hero'
import { monsterHtml, monsterName } from './monster'
import { FRAMES, type State } from './slime'

const DEMO_SEED = 56433

type Dir = 'left' | 'right' | 'up' | 'down'

export const LOOP = 17000
const COUNT = 750

const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: 0, to: 3850, text: 'a monster picks where to strike <b>before</b> you move' },
  { from: 3850, to: 4250, text: 'turn your head somewhere else' },
  { from: 4250, to: 6200, text: 'dodged. <b>it takes the hit.</b>' },
  { from: 6200, to: 8850, text: 'same again. this time you turn into it' },
  { from: 8850, to: 10800, text: 'it called you. <b>you take the hit.</b>' },
  { from: 10800, to: 14500, text: 'it learns your habits as you play' },
  { from: 14500, to: LOOP, text: 'so be unpredictable. <b>beat as many as you can.</b>' },
]

// Two exchanges: one dodge, one hit.
const ROUNDS = [
  { countAt: 1600, strike: 'right' as Dir, look: 'left' as Dir, resolve: 4250, clear: 6000 },
  { countAt: 6200, strike: 'up' as Dir, look: 'up' as Dir, resolve: 8850, clear: 10600 },
]

const ease = (p: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3)

export type DemoFrame = {
  caption: string
  count: string
  strike: Dir | null
  look: Look
  face: Face
  foeHp: number
  youHp: number
  foe: [State, number]
  youShake: number
  youFlash: number
  sparks: number
  tell: number
  step: number
}


export function frameAt(t: number): DemoFrame {
  t = ((t % LOOP) + LOOP) % LOOP
  const caption = CAPTIONS.find((c) => t >= c.from && t < c.to)?.text ?? ''
  let count = '', strike: Dir | null = null
  let look: Look = 'centre'
  let face: Face = 'neutral'
  let foeHp = 1, youHp = 1, youShake = 0, youFlash = 0, sparks = -1
  // The slime idles, lunges on HOI and splats when hit, each as a frame of its own sprite strip.
  let foe: [State, number] = ['idle', Math.floor(t / 140) % FRAMES.idle.length]

  for (const r of ROUNDS) {
    const hoi = r.countAt + COUNT * 3
    if (t >= r.countAt && t < hoi) count = String(3 - Math.floor((t - r.countAt) / COUNT))
    if (t >= hoi && t < hoi + 400) count = 'HOI'
    if (t >= hoi && t < hoi + 340) foe = ['strike', Math.min(FRAMES.strike.length - 1, Math.floor((t - hoi) / 68))]
    if (t >= hoi && t < r.clear) strike = r.strike
    // The head turns a beat after HOI and comes back when the round clears.
    if (t >= hoi + 160 && t < r.clear + 100) look = r.look
    const dodged = r.strike !== r.look
    // Focus on HOI, and shock if it lands.
    if (t >= hoi && t < r.clear) face = !dodged && t >= r.resolve ? 'shock' : 'focus'
    if (t >= r.resolve) {
      const p = ease((t - r.resolve) / 300)
      if (dodged) foeHp -= 0.3 * p
      else youHp -= 0.22 * p
    }
    if (t >= r.resolve && t < r.resolve + 360) {
      const k = (t - r.resolve) / 360
      if (!dodged) { youShake = Math.sin(k * Math.PI * 6) * (1 - k); youFlash = 1 - k }
    }
    if (dodged && t >= r.resolve && t < r.resolve + 550) sparks = (t - r.resolve) / 550
    if (dodged && t >= r.resolve && t < r.resolve + 800) foe = ['hit', Math.min(FRAMES.hit.length - 1, Math.floor((t - r.resolve) / 100))]
  }
  const tell = t >= 11200 && t < 14500 ? Math.min(1, (t - 11200) / 250, (14500 - t) / 250) : 0
  const step = CAPTIONS.findIndex((c) => t >= c.from && t < c.to)
  return { caption, count, strike, look, face, foeHp, youHp, foe, youShake, youFlash, sparks, tell, step }
}

const HAND: Record<Dir, string> = { left: '\u{1F448}', right: '\u{1F449}', up: '\u{1F446}', down: '\u{1F447}' }

function mount(root: HTMLElement): (t: number) => void {
  root.innerHTML = `
    <div class="d-fighters">
      <div class="d-side">
        <div class="d-bar"><span>you</span><div class="d-hp"><i id="dYouHp"></i></div></div>
        <div class="d-box" id="dYou">${heroHtml()}<div id="dStrike"></div></div>
      </div>
      <div class="d-side">
        <div class="d-bar"><span>${monsterName(DEMO_SEED, 1)}</span><div class="d-hp foe"><i id="dFoeHp"></i></div></div>
        <div class="d-box" id="dFoe">${monsterHtml(DEMO_SEED)}<div id="dSparks"></div></div>
      </div>
    </div>
    <div id="dCount"></div>
    <div id="dTell"><div class="eyebrow">it has you</div><div>After left you go right, 7 times out of 7.</div></div>
    <div id="dCaption"></div>
    <div id="dSteps">${CAPTIONS.map(() => '<i></i>').join('')}</div>`
  const q = (s: string) => root.querySelector(s) as HTMLElement
  const you = q('#dYou'), foe = q('#dFoe'), mon = foe.querySelector('.mon') as HTMLElement
  const sparksEl = q('#dSparks')
  sparksEl.innerHTML = Array.from({ length: 12 }, () => '<b></b>').join('')
  const sparks = Array.from(sparksEl.children) as HTMLElement[]
  const steps = Array.from(q('#dSteps').children) as HTMLElement[]
  let lastCaption = ''

  return (t: number) => {
    const f = frameAt(t)
    if (f.caption !== lastCaption) { q('#dCaption').innerHTML = f.caption; lastCaption = f.caption }
    q('#dCount').textContent = f.count
    q('#dCount').className = f.count === 'HOI' ? 'hoi' : ''
    const s = q('#dStrike')
    s.textContent = f.strike ? HAND[f.strike] : ''
    s.className = f.strike ? `at-${f.strike}` : ''
    paintHero(you.querySelector('canvas')!, { look: f.look, face: f.face, shake: f.youShake, bob: Math.floor(t / 500) % 2 })
    q('#dYouHp').style.transform = `scaleX(${f.youHp})`
    q('#dFoeHp').style.transform = `scaleX(${f.foeHp})`
    you.style.setProperty('--flash', String(f.youFlash))
    const [state, frame] = f.foe, n = FRAMES[state].length
    mon.style.backgroundImage = `var(--${state})`
    mon.style.backgroundSize = `${n * 100}% 100%`
    mon.style.backgroundPositionX = `${(frame / (n - 1)) * 100}%`
    sparks.forEach((el, i) => {
      if (f.sparks < 0) { el.style.opacity = '0'; return }
      const a = (i / sparks.length) * Math.PI * 2, d = 30 + 70 * ease(f.sparks)
      el.style.opacity = String(1 - f.sparks)
      el.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`
    })
    q('#dTell').style.opacity = String(f.tell)
    q('.d-fighters').style.opacity = String(1 - f.tell * 0.65)
    q('#dTell').style.transform = `translateY(${(1 - f.tell) * 8}px)`
    steps.forEach((el, i) => el.classList.toggle('on', i === f.step))
  }
}

// Starts the loop in the given element; returns the function that stops it.
export function openDemo(root: HTMLElement): () => void {
  const paint = mount(root)
  const start = performance.now()
  let frame = requestAnimationFrame(function tick() {
    paint(performance.now() - start)
    frame = requestAnimationFrame(tick)
  })
  return () => cancelAnimationFrame(frame)
}
