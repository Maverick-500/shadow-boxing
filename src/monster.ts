// Monster names by seed and level; the monster itself is a pixel slime from slime.ts.

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!

const FRONT = ['Grub', 'Kor', 'Zan', 'Mol', 'Vex', 'Thra', 'Nib', 'Skor', 'Bel', 'Ug', 'Rax', 'Mur', 'Ploo', 'Gor', 'Fen', 'Wix']
const BACK = ['nak', 'dor', 'gle', 'mok', 'rix', 'thul', 'bo', 'zed', 'grim', 'lop', 'sk', 'wart', 'ble', 'oth']
// Titles get more knowing as the levels climb, because so does the monster.
const TITLES = [
  ['the Curious', 'the Hungry', 'the Lumpy', 'the Damp'],
  ['the Watcher', 'the Patient', 'the Sniffer', 'the Listener'],
  ['the Reader', 'the Unblinking', 'who Remembers', 'the Studied'],
  ['who Knows You', 'the Inevitable', 'the Mind Eater', 'Behind Your Eyes'],
]

export function monsterName(seed: number, level: number): string {
  const r = rng(seed ^ 0x9e3779b9)
  const tier = TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))]!
  return `${pick(r, FRONT)}${pick(r, BACK)} ${pick(r, tier)}`
}

// The fight's monster is a pixel slime by seed.
export { slimeHtml as monsterHtml } from './slime'
