// Monsters drawn from a seed. Endless mode needs a new creature every fight, and a fixed set of images would start repeating.

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
const between = (r: () => number, lo: number, hi: number): number => lo + r() * (hi - lo)

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

// Cool and saturated, so a monster never wears the orange that means the machine is ahead.
const HUES = [150, 170, 195, 215, 250, 275, 300, 330, 95, 125]

// A closed Catmull-Rom curve through the points, written as cubic beziers.
function smoothPath(pts: [number, number][]): string {
  const n = pts.length
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!, p1 = pts[i]!, p2 = pts[(i + 1) % n]!, p3 = pts[(i + 2) % n]!
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d + 'Z'
}

export function monsterSvg(seed: number): string {
  const r = rng(seed)
  const hue = pick(r, HUES)
  const sat = between(r, 38, 58)
  const skin = `hsl(${hue} ${sat}% 38%)`
  const shade = `hsl(${hue} ${sat}% 24%)`
  const belly = `hsl(${hue} ${sat * 0.8}% 52%)`
  const glow = `hsl(${(hue + 160) % 360} 90% 62%)`

  const cx = 100, cy = 128
  const base = between(r, 60, 72)
  const count = 7 + Math.floor(r() * 4)
  const squash = between(r, 0.82, 1.08)
  const pts: [number, number][] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2
    const rad = base * between(r, 0.84, 1.12)
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * squash])
  }
  const top = cy - base * squash

  let parts = ''

  // Horns or ears, before the body so the body overlaps their roots.
  const horns = Math.floor(r() * 3)
  if (horns > 0) {
    const spread = between(r, 22, 40), height = between(r, 22, 42), lean = between(r, -8, 14)
    // Base is symmetric about bx; only the tip leans. The old base used side for one corner, which collapsed the left horn to a sliver.
    const horn = (bx: number, base: number, w: number, h: number, l: number, side: number): string => {
      const tx = bx + side * l, ty = base - h
      return `<path d="M${bx - w},${base} Q${bx - w * 0.4 + side * l * 0.5},${base - h * 0.55} ${tx},${ty} Q${bx + w * 0.6 + side * l * 0.3},${base - h * 0.45} ${bx + w},${base} Z" fill="${shade}"/>`
    }
    for (const side of [-1, 1]) {
      parts += horn(cx + side * spread, top + 16, 11, height, lean, side)
      if (horns === 2) parts += horn(cx + side * (spread + 20), top + 28, 7, height * 0.6, lean + 8, side)
    }
  }

  // Arms, also behind the body.
  if (r() < 0.75) {
    const ay = cy + between(r, -4, 18)
    for (const side of [-1, 1]) {
      const sx = cx + side * base * 0.86
      parts += `<path d="M${sx},${ay} q${side * 26},${between(r, -6, 16)} ${side * 30},${between(r, 18, 32)}" stroke="${shade}" stroke-width="13" stroke-linecap="round" fill="none"/>`
    }
  }

  // Feet.
  for (const side of [-1, 1]) {
    parts += `<ellipse cx="${cx + side * base * 0.42}" cy="${cy + base * squash - 4}" rx="17" ry="10" fill="${shade}"/>`
  }

  parts += `<path d="${smoothPath(pts)}" fill="${skin}" stroke="${shade}" stroke-width="4"/>`
  parts += `<ellipse cx="${cx}" cy="${cy + base * 0.28}" rx="${base * 0.52}" ry="${base * 0.42 * squash}" fill="${belly}" opacity=".55"/>`

  // Eyes. One, two or three, looking slightly down at whoever is playing.
  const eyes = 1 + Math.floor(r() * 3)
  const eyeY = cy - base * 0.28 * squash
  const eyeR = eyes === 1 ? between(r, 17, 23) : between(r, 10, 15)
  const gap = eyes === 1 ? 0 : between(r, 22, 30)
  const glowing = r() < 0.4
  for (let i = 0; i < eyes; i++) {
    const ex = cx + (i - (eyes - 1) / 2) * gap
    const ey = eyeY + (eyes === 3 && i === 1 ? -9 : 0)
    parts += `<circle cx="${ex}" cy="${ey}" r="${eyeR}" fill="#f4f1ea" stroke="${shade}" stroke-width="3"/>`
    parts += `<circle class="pupil" cx="${ex}" cy="${ey + eyeR * 0.25}" r="${eyeR * 0.48}" fill="${glowing ? glow : '#0b0d11'}"/>`
    parts += `<circle cx="${ex - eyeR * 0.22}" cy="${ey - eyeR * 0.1}" r="${eyeR * 0.16}" fill="#fff" opacity=".85"/>`
  }

  // A mouth with a few teeth.
  const mw = between(r, 26, 46), my = cy + base * 0.18
  const smile = between(r, 6, 16)
  parts += `<path d="M${cx - mw / 2},${my} Q${cx},${my + smile * 2} ${cx + mw / 2},${my} Z" fill="#14070a" stroke="${shade}" stroke-width="3"/>`
  const teeth = 2 + Math.floor(r() * 4)
  for (let i = 0; i < teeth; i++) {
    const tx = cx - mw / 2 + (mw / (teeth + 1)) * (i + 1)
    const down = i % 2 === 0
    parts += down
      ? `<path d="M${tx - 4},${my + 1} L${tx},${my + 9} L${tx + 4},${my + 1} Z" fill="#f4f1ea"/>`
      : `<path d="M${tx - 3.5},${my + smile * 1.4} L${tx},${my + smile * 0.8} L${tx + 3.5},${my + smile * 1.4} Z" fill="#f4f1ea"/>`
  }

  return (
    '<svg viewBox="0 0 200 220" aria-hidden="true">' +
    `<ellipse class="shadow" cx="${cx}" cy="${cy + base * squash + 8}" rx="${base * 0.9}" ry="9" fill="#000" opacity=".45"/>` +
    `<g class="mon">${parts}</g></svg>`
  )
}
