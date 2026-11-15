// The player in the how-to-play demo: a pixel adventurer drawn in code, with a big head so the turn reads from across a room.

export type Face = 'neutral' | 'focus' | 'shock'
export type Look = 'centre' | 'left' | 'right' | 'up' | 'down'
export type Pose = { look: Look; face: Face; shake: number; bob: number }

export const HW = 48, HH = 48
const GROUND = 45

// Sprites as rows of characters; each character is a palette slot below.
const HEAD = [
  '....kkkkkk....',
  '..kkHHhhhhkk..',
  '.kHHhhhhhhhhk.',
  'khhhhhhhhhhhhk',
  'khhhhhhhhhhhhk',
  'khhsshhhhhshhk',
  'khssssssssssSk',
  'kssssssssssSSk',
  'kssssssssssSSk',
  'kssssssssssSSk',
  '.ksssssssssSk.',
  '..kSsssssSSk..',
  '...kkkkkkkk...',
]
const BODY = [
  '..kkkkkkkk..',
  '.kttttttttk.',
  'ktttttttttTk',
  'ktttttttttTk',
  'ktttttttttTk',
  'kbbbbggbbbbk',
  'ktttttttttTk',
  '.kttttttttk.',
  '..kkkkkkkk..',
]
const LEGS = [
  '.kppk..kppk.',
  '.kppk..kppk.',
  '.kook..kook.',
  '.koook.koook',
  '.kkkkk.kkkkk',
]
const ARM = ['.kk', 'ktk', 'ktk', 'ktk', 'kSk', 'ksk', '.k.']

const SLOTS = '.khHsSewmtTbgpPoq'
const PALETTE = ['', '#14101c', '#6b3a1e', '#9a5a2c', '#f5c48f', '#d9935f', '#14101c', '#ffffff', '#8e2f2f', '#3a6fd8', '#274a9c', '#5a3a1e', '#ffd23f', '#6b4a2e', '#4e3520', '#3d2a1a', 'rgba(0,0,0,.28)']

// Where the face sits and which way the head leans for each look.
const TURN: Record<Look, { fx: number; fy: number; hx: number; hy: number }> = {
  centre: { fx: 0, fy: 0, hx: 0, hy: 0 },
  left: { fx: -2, fy: 0, hx: -1, hy: 0 },
  right: { fx: 2, fy: 0, hx: 1, hy: 0 },
  up: { fx: 0, fy: -1, hx: 0, hy: -1 },
  down: { fx: 0, fy: 1, hx: 0, hy: 1 },
}

export function heroPixels(p: Pose): Uint8Array {
  const px = new Uint8Array(HW * HH)
  const put = (x: number, y: number, v: number): void => { if (v && x >= 0 && y >= 0 && x < HW && y < HH) px[y * HW + x] = v }
  const stamp = (art: string[], x0: number, y0: number): void =>
    art.forEach((row, j) => [...row].forEach((ch, i) => put(x0 + i, y0 + j, SLOTS.indexOf(ch))))
  const sx = Math.round(p.shake * 2), b = p.bob > 0.5 ? 1 : 0
  const t = TURN[p.look]

  // Ground shadow first, so everything stands on it.
  for (let x = 16; x < 32; x++) { put(x + sx, GROUND, 16); if (x > 17 && x < 30) put(x + sx, GROUND + 1, 16) }
  stamp(ARM, 15 + sx, 32 + b)
  stamp(LEGS, 18 + sx, 40)
  stamp(BODY, 18 + sx, 31 + b)

  // The head: hair spills over the side it turns away from, so a turn reads as a turn and not a slide.
  const head = HEAD.map((row) => [...row])
  const hairAt = (cols: number[], rows: number[]): void => { for (const r of rows) for (const c of cols) if ('sS'.includes(head[r]![c]!)) head[r]![c] = 'h' }
  if (p.look === 'left') hairAt([10, 11, 12], [5, 6, 7, 8, 9])
  if (p.look === 'right') hairAt([1, 2, 3], [5, 6, 7, 8, 9])
  if (p.look === 'down') hairAt([2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [6])
  if (p.look === 'up') for (const c of [3, 4, 9, 10]) head[5]![c] = 's'
  const fx = (x: number, y: number, ch: string): void => {
    const c = x + t.fx, r = y + t.fy
    if (head[r] && 'sS'.includes(head[r]![c] ?? '.')) head[r]![c] = ch
  }
  if (p.face === 'shock') {
    for (const [x, y] of [[4, 7], [5, 7], [8, 7], [9, 7]] as const) fx(x, y, 'w')
    fx(4, 8, 'w'); fx(5, 8, 'e'); fx(8, 8, 'e'); fx(9, 8, 'w')
    fx(6, 10, 'k'); fx(7, 10, 'k'); fx(6, 11, 'm'); fx(7, 11, 'm')
  } else {
    for (const [x, y] of [[4, 7], [4, 8], [9, 7], [9, 8]] as const) fx(x, y, 'e')
    if (p.face === 'focus') { fx(3, 6, 'k'); fx(4, 6, 'k'); fx(9, 6, 'k'); fx(10, 6, 'k'); fx(5, 10, 'm'); fx(6, 10, 'm'); fx(7, 10, 'm') }
    else { fx(6, 10, 'm'); fx(7, 10, 'm') }
  }
  stamp(head.map((r) => r.join('')), 17 + sx + t.hx, 19 + b + t.hy)

  stamp(ARM, 29 + sx, 32 + b)
  return px
}

export function heroHtml(): string {
  return `<canvas class="hero" width="${HW}" height="${HH}" aria-hidden="true"></canvas>`
}

// Repaints only when the pose actually changes.
const last = new WeakMap<HTMLCanvasElement, string>()
export function paintHero(canvas: HTMLCanvasElement, p: Pose): void {
  const key = `${p.look}${p.face}${Math.round(p.shake * 2)}${p.bob > 0.5 ? 1 : 0}`
  if (last.get(canvas) === key) return
  last.set(canvas, key)
  const g = canvas.getContext('2d')!
  g.clearRect(0, 0, HW, HH)
  const px = heroPixels(p)
  for (let i = 0; i < px.length; i++) if (px[i]) { g.fillStyle = PALETTE[px[i]!]!; g.fillRect(i % HW, (i / HW) | 0, 1, 1) }
}

