// Monsters assembled from Kenney's Monster Builder Pack (CC0) by seed. Endless mode needs a new creature every fight, and a fixed set of images would start repeating.
import { PARTS, type Part } from './parts'

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

const COLOURS = ['blue', 'dark', 'green', 'red', 'white', 'yellow'] as const
const DETAILS = ['horn_large', 'horn_small', 'antenna_large', 'antenna_small', 'ear', 'ear_round'] as const
const ART = 'monster/'
const of = (prefix: string): string[] => Object.keys(PARTS).filter((k) => k.startsWith(prefix))
const EYES = of('eye_')
const MOUTHS = of('mouth')
const NOSES = of('nose_')

type Piece = { href: string; x: number; y: number; w: number; h: number; flip: boolean }

export function monsterSvg(seed: number): string {
  const r = rng(seed)
  const c = pick(r, COLOURS)
  const body = pick(r, of(`body_${c}`)), arm = pick(r, of(`arm_${c}`)), leg = pick(r, of(`leg_${c}`))
  const B = PARTS[body]!, A = PARTS[arm]!, L = PARTS[leg]!
  const behind: Piece[] = [], front: Piece[] = []

  // Limbs are placed by the joint ball detected on each image, tucked under the body's edge and mirrored on the left.
  const limb = (href: string, part: Part, tx: number, ty: number, flip: boolean): Piece => {
    const [jx, jy] = part.j ?? [0.3, 0.15]
    return { href, x: tx - (flip ? 1 - jx : jx) * part.w, y: ty - jy * part.h, w: part.w, h: part.h, flip }
  }
  for (const flip of [true, false]) {
    const side = flip ? -1 : 1
    behind.push(limb(leg, L, B.w / 2 + side * B.w * 0.22, B.h * 0.88, flip))
    behind.push(limb(arm, A, B.w / 2 + side * B.w * 0.44, B.h * 0.42, flip))
  }

  // Horns, ears or antennae, base hidden behind the crown.
  if (r() < 0.75) {
    const key = `detail_${c}_${pick(r, DETAILS)}`
    const D = PARTS[key]
    if (D) for (const flip of [true, false]) {
      const tx = B.w / 2 + (flip ? -1 : 1) * B.w * 0.26
      behind.push({ href: key, x: tx - (flip ? 0.7 : 0.3) * D.w, y: B.h * 0.1 - 0.88 * D.h, w: D.w, h: D.h, flip })
    }
  }

  // One to three eyes, shrunk to fit narrow bodies.
  const eyes = 1 + Math.floor(r() * 3)
  const eye = pick(r, EYES), E = PARTS[eye]!
  const fit = Math.min(1, (B.w * 0.78) / (eyes * E.w * 1.06))
  const ew = E.w * fit, eh = E.h * fit
  for (let i = 0; i < eyes; i++) {
    const cx = B.w / 2 + (i - (eyes - 1) / 2) * ew * 1.06
    const cy = B.h * 0.34 + (eyes === 3 && i === 1 ? -eh * 0.18 : 0)
    front.push({ href: eye, x: cx - ew / 2, y: cy - eh / 2, w: ew, h: eh, flip: false })
  }
  if (r() < 0.25) {
    const nose = pick(r, NOSES), N = PARTS[nose]!, s = Math.min(1, (B.w * 0.3) / N.w)
    front.push({ href: nose, x: B.w / 2 - (N.w * s) / 2, y: B.h * 0.48 - (N.h * s) / 2, w: N.w * s, h: N.h * s, flip: false })
  }
  const mouth = pick(r, MOUTHS), Mo = PARTS[mouth]!, ms = Math.min(1, (B.w * 0.6) / Mo.w)
  front.push({ href: mouth, x: B.w / 2 - (Mo.w * ms) / 2, y: B.h * 0.64 - (Mo.h * ms) / 2, w: Mo.w * ms, h: Mo.h * ms, flip: false })

  const pieces = [...behind, { href: body, x: 0, y: 0, w: B.w, h: B.h, flip: false }, ...front]
  const minX = Math.min(...pieces.map((p) => p.x)), maxX = Math.max(...pieces.map((p) => p.x + p.w))
  const minY = Math.min(...pieces.map((p) => p.y)), maxY = Math.max(...pieces.map((p) => p.y + p.h))
  const pad = 12, vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2 + 18
  const ox = pad - minX, oy = pad - minY
  const draw = (p: Piece): string => {
    const x = p.x + ox, y = p.y + oy
    const t = p.flip ? ` transform="translate(${(2 * x + p.w).toFixed(1)} 0) scale(-1 1)"` : ''
    return `<image href="${ART}${p.href}.png" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.h.toFixed(1)}"${t}/>`
  }
  return `<svg viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" aria-hidden="true" overflow="visible">` +
    `<ellipse class="shadow" cx="${(vw / 2).toFixed(0)}" cy="${(vh - 12).toFixed(0)}" rx="${(B.w * 0.55).toFixed(0)}" ry="10" fill="#000" opacity=".4"/>` +
    `<g class="mon">${pieces.map(draw).join('')}</g></svg>`
}
