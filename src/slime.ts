// Pixel-art slimes for the RPG fights, rasterised per frame at native resolution so squash and stretch never blurs a pixel; each fight state is a sprite strip played with CSS steps().

export type State = 'idle' | 'hit' | 'strike' | 'down' | 'enter'
export const FW = 80, FH = 64, GROUND = 60

type Key = { sx: number; sy: number; dy?: number; dx?: number; lean?: number; flash?: boolean; fade?: number; blink?: boolean; hurt?: boolean; open?: boolean }

// Each state's frames; the timing lives in the CSS, one step per frame.
export const FRAMES: Record<State, Key[]> = {
  idle: [
    { sx: 1, sy: 1 }, { sx: 1, sy: 1, blink: true }, { sx: 1, sy: 1 }, { sx: 1.12, sy: 0.86 }, { sx: 0.88, sy: 1.16, dy: -4 },
    { sx: 0.94, sy: 1.06, dy: -8 }, { sx: 0.9, sy: 1.12, dy: -4 }, { sx: 1.18, sy: 0.82 }, { sx: 0.96, sy: 1.05 }, { sx: 1, sy: 1 },
  ],
  // Splat flat, then bounce back up into the air and settle.
  hit: [
    { sx: 1.4, sy: 0.5, flash: true, hurt: true }, { sx: 1.45, sy: 0.45, hurt: true }, { sx: 1.2, sy: 0.7, hurt: true }, { sx: 0.82, sy: 1.3, dy: -4, hurt: true },
    { sx: 0.86, sy: 1.2, dy: -9 }, { sx: 0.95, sy: 1.05, dy: -4 }, { sx: 1.15, sy: 0.85 }, { sx: 1, sy: 1 },
  ],
  // Lunges at the player, who stands to its left.
  strike: [
    { sx: 1, sy: 1 }, { sx: 1.1, sy: 0.9, dx: -2, lean: -0.2, open: true }, { sx: 1.08, sy: 0.92, dx: -7, lean: -0.5, open: true },
    { sx: 1.04, sy: 0.96, dx: -4, lean: -0.3 }, { sx: 1, sy: 1 },
  ],
  // Melts into a puddle and dithers away.
  down: [
    { sx: 1.2, sy: 0.8, hurt: true }, { sx: 1.4, sy: 0.6, hurt: true }, { sx: 1.6, sy: 0.42, hurt: true }, { sx: 1.8, sy: 0.3 },
    { sx: 1.9, sy: 0.22, fade: 0.25 }, { sx: 2, sy: 0.18, fade: 0.5 }, { sx: 2, sy: 0.16, fade: 0.75 }, { sx: 2, sy: 0.15, fade: 1 },
  ],
  // Drops in from above and lands with a squash.
  enter: [
    { sx: 0.85, sy: 1.2, dy: -24 }, { sx: 0.85, sy: 1.2, dy: -17 }, { sx: 0.85, sy: 1.18, dy: -9 }, { sx: 0.88, sy: 1.14, dy: -4 },
    { sx: 1.3, sy: 0.7 }, { sx: 0.9, sy: 1.12, dy: -3 }, { sx: 1.06, sy: 0.94 }, { sx: 1, sy: 1 },
  ],
}

// Palette slots: 0 empty, 1 outline, 2 shade, 3 fill, 4 light, 5 shine, 6 ink, 7 white, 8 tongue, 9 shadow, 10 horn, 11 gold, 12 leaf, 13 leaf dark.
const FIXED = ['#14101c', '#ffffff', '#ff6b8a', 'rgba(0,0,0,.28)', '#f4e6c4', '#ffd23f', '#5ccf4a', '#22682a']
// Outline, shade, fill, light, shine per colour, with a weight so pale ones turn up less often.
const RAMPS: { name: string; ramp: string[]; weight: number }[] = [
  { name: 'green', ramp: ['#1d3b26', '#2f8f3e', '#4cc552', '#9be36a', '#eaffd0'], weight: 4 },
  { name: 'blue', ramp: ['#1a2a52', '#2c5fb8', '#4a95ec', '#8fd0ff', '#e6f8ff'], weight: 3 },
  { name: 'red', ramp: ['#45121f', '#b52b3c', '#ef4f55', '#ff9b8a', '#fff0e6'], weight: 3 },
  { name: 'yellow', ramp: ['#4a3008', '#c98a12', '#f5c02c', '#ffe773', '#fffbe0'], weight: 2 },
  { name: 'purple', ramp: ['#2b1747', '#6c3cb0', '#9b62e8', '#c9a0ff', '#f5ebff'], weight: 3 },
  { name: 'pink', ramp: ['#4a1636', '#c2457e', '#f07aa8', '#ffb3cf', '#fff0f6'], weight: 2 },
  { name: 'ghost', ramp: ['#2c3347', '#9aa6c2', '#d5ddef', '#f4f7fd', '#ffffff'], weight: 1 },
]

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

// Small sprites as rows of characters: k ink, w white, r tongue, . skip.
const EYES: Record<string, string[]> = {
  oval: ['wk', 'kk', 'kk', 'kk'],
  round: ['.kk.', 'kwkk', 'kkkk', 'kkkk', '.kk.'],
  big: ['.kkk.', 'kwwkk', 'kwkkk', 'kkkkk', '.kkk.'],
  wide: ['kkkk', 'kwkk', 'kkkk'],
  happy: ['.kk.', 'k..k', 'k..k'],
  sleepy: ['kkkk', '.kk.'],
}
const MOUTHS: Record<string, string[]> = {
  smile: ['k....k', '.k..k.', '..kk..'],
  flat: ['kkkk'],
  fang: ['kkkkkk', '.w..w.'],
  grin: ['kkkkkk', 'kwwwwk', '.kkkk.'],
  open: ['.kkk.', 'krrrk', '.kkk.'],
  tiny: ['k..k', '.kk.'],
}
const OPEN = ['.kkk.', 'krrrk', 'krrrk', '.kkk.']
const HURT_L = ['kk..', '..kk', 'kk..'], HURT_R = ['..kk', 'kk..', '..kk']
const BLINK = ['kkkk']

export type Spec = { ramp: string[]; colour: string; w: number; h: number; tip: boolean; eyes: number; eye: string; mouth: string; extra: string }

export function slimeSpec(seed: number): Spec {
  const r = rng(seed)
  const total = RAMPS.reduce((s, x) => s + x.weight, 0)
  let roll = r() * total, chosen = RAMPS[0]!
  for (const x of RAMPS) { roll -= x.weight; if (roll < 0) { chosen = x; break } }
  const w = 26 + Math.floor(r() * 13)
  const h = Math.round(w * (0.62 + r() * 0.22))
  return {
    ramp: chosen.ramp, colour: chosen.name, w, h, tip: r() < 0.3,
    eyes: 1 + Math.floor(r() * 3), eye: pick(r, Object.keys(EYES)), mouth: pick(r, Object.keys(MOUTHS)),
    extra: pick(r, ['none', 'none', 'none', 'antenna', 'horns', 'sprout', 'crown']),
  }
}

// Bayer 4x4, for the dithered fade-out.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export function rasterise(s: Spec, k: Key): Uint8Array {
  const px = new Uint8Array(FW * FH)
  const solid = new Uint8Array(FW * FH)
  const set = (x: number, y: number, v: number, into = px): void => { if (x >= 0 && y >= 0 && x < FW && y < FH) into[y * FW + x] = v }
  const at = (x: number, y: number, from = px): number => (x >= 0 && y >= 0 && x < FW && y < FH ? from[y * FW + x]! : 0)
  const w = Math.max(4, Math.round(s.w * k.sx)), h = Math.max(2, Math.round(s.h * k.sy))
  const base = GROUND + Math.round(k.dy ?? 0), top = base - h
  const cx = FW / 2 + Math.round(k.dx ?? 0)
  const p = s.tip ? 1.6 : 2.4
  // Where each row of the body starts and ends, after the lean.
  const rows: { y: number; l: number; r: number; t: number }[] = []
  for (let y = top; y < base; y++) {
    const t = (y - top + 0.5) / h
    let hw = (w / 2) * Math.pow(1 - Math.pow(1 - t, p), 1 / p)
    if (y === base - 1) hw -= 1
    const shift = (k.lean ?? 0) * (1 - t) * h * 0.6
    const l = Math.round(cx + shift - hw), r = Math.round(cx + shift + hw) - 1
    if (r >= l) rows.push({ y, l, r, t })
    for (let x = l; x <= r; x++) set(x, y, 1, solid)
  }
  const midAt = (y: number): number => { const row = rows.find((q) => q.y === y); return row ? (row.l + row.r + 1) / 2 : cx }

  // Accessories sit on the crown and get the same outline as the body.
  const acc: [number, number, number][] = []
  const stamp = (x0: number, y0: number, art: string[], map: Record<string, number>): void =>
    art.forEach((line, j) => [...line].forEach((ch, i) => { if (map[ch]) acc.push([x0 + i, y0 + j, map[ch]!]) }))
  if (h >= 10 && !k.flash) {
    const crown = midAt(top + 1)
    if (s.extra === 'antenna') for (const side of [-1, 1]) {
      const x = Math.round(crown + side * w * 0.22)
      const y = rows.find((q) => q.l <= x && q.r >= x)?.y ?? top
      stamp(x - 1, y - 8, ['bbb', 'bbb', 'bbb', '.s.', '.s.', '.s.', '.s.', '.s.'], { b: 4, s: 2 })
    }
    if (s.extra === 'horns') for (const side of [-1, 1]) {
      const x = Math.round(crown + side * w * 0.2)
      const y = rows.find((q) => q.l <= x && q.r >= x)?.y ?? top
      stamp(x - 2, y - 5, side < 0 ? ['h...', 'hh..', 'hhh.', 'hhhh', 'hhhh'] : ['...h', '..hh', '.hhh', 'hhhh', 'hhhh'], { h: 10 })
    }
    if (s.extra === 'sprout') stamp(Math.round(crown) - 4, top - 6, ['lll..ddd', '.lll.dd.', '...ld...', '...dd...', '...dd...', '...dd...'], { l: 12, d: 13 })
    if (s.extra === 'crown') stamp(Math.round(crown) - 5, top - 6, ['g..g..g', 'gg.g.gg', 'ggggggg', 'ggggggg', 'ggggggg'], { g: 11 })
  }
  for (const [x, y] of acc) set(x, y, 1, solid)

  // Outline wherever a solid pixel touches empty space.
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!at(x, y, solid)) continue
    const edge = !at(x - 1, y, solid) || !at(x + 1, y, solid) || !at(x, y - 1, solid) || !at(x, y + 1, solid)
    set(x, y, edge ? 1 : 3)
  }
  // Body shading: dark base and right side, light left rim, a shine.
  for (const row of rows) for (let x = row.l + 1; x < row.r; x++) {
    if (at(x, row.y) !== 3) continue
    const u = (x - row.l) / Math.max(1, row.r - row.l)
    let v = 3
    if (row.t > 0.74 || u > 0.8) v = 2
    else if (u < 0.2 && row.t > 0.18) v = 4
    set(x, row.y, k.flash ? 7 : v)
  }
  for (const [x, y, v] of acc) if (at(x, y) === 3) set(x, y, k.flash ? 7 : v)
  if (!k.flash && h >= 8) {
    const sx = Math.round(midAt(top + 2) - w * 0.26), sy = top + Math.max(2, Math.round(h * 0.2))
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [0, 2]] as const) if (at(sx + dx, sy + dy) >= 2 && at(sx + dx, sy + dy) <= 4) set(sx + dx, sy + dy, 5)
  }

  // Face, which keeps its pixel size and only moves with the body.
  if (h >= 7 && !(k.fade && k.fade > 0.2)) {
    const ink: Record<string, number> = { k: 6, w: 7, r: 8 }
    const draw = (x0: number, y0: number, art: string[]): void =>
      art.forEach((line, j) => [...line].forEach((ch, i) => { if (ink[ch] && at(x0 + i, y0 + j) >= 2) set(x0 + i, y0 + j, ink[ch]!) }))
    const ey = top + Math.round(h * 0.34)
    const eyeArt = k.blink ? BLINK : EYES[s.eye]!
    const ew = k.hurt ? 4 : eyeArt[0]!.length
    const gap = s.eyes === 1 ? 0 : Math.max(2, Math.round(w * 0.1))
    const span = s.eyes * ew + (s.eyes - 1) * gap
    const mid = Math.round(midAt(ey))
    for (let i = 0; i < s.eyes; i++) {
      const x0 = mid - Math.floor(span / 2) + i * (ew + gap)
      const art = k.hurt ? (i < s.eyes / 2 - 0.01 || s.eyes === 1 ? HURT_L : HURT_R) : eyeArt
      draw(x0, ey + (k.blink ? 2 : 0), art)
    }
    const mArt = k.hurt || k.open ? OPEN : MOUTHS[s.mouth]!
    const my = ey + Math.max(k.hurt ? 3 : (EYES[s.eye]!.length), 3) + Math.max(2, Math.round(h * 0.08))
    draw(Math.round(midAt(my)) - Math.floor(mArt[0]!.length / 2), my, mArt)
  }

  // Dithered fade, then the shadow on the ground, smaller the higher it hops.
  if (k.fade) for (let i = 0; i < px.length; i++) if (BAYER[((i / FW) | 0) % 4 * 4 + (i % FW) % 4]! / 16 < k.fade) px[i] = 0
  const lift = Math.min(1, -(k.dy ?? 0) / 30)
  const sw = Math.round(w * 0.5 * (1 - lift * 0.5)) * (k.fade ? 1 - k.fade : 1)
  for (let x = Math.round(cx - sw); x < Math.round(cx + sw); x++) {
    if (!at(x, GROUND)) set(x, GROUND, 9)
    if (Math.abs(x + 0.5 - cx) < sw - 2 && !at(x, GROUND + 1)) set(x, GROUND + 1, 9)
  }
  return px
}

export function paletteOf(s: Spec): string[] {
  return ['transparent', ...s.ramp, ...FIXED]
}

// Browser only: paints each state's frames side by side and returns them as PNG data URLs.
export function sheets(seed: number): Record<State, string> {
  const s = slimeSpec(seed), pal = paletteOf(s)
  const out = {} as Record<State, string>
  for (const state of Object.keys(FRAMES) as State[]) {
    const frames = FRAMES[state]
    const c = document.createElement('canvas')
    c.width = FW * frames.length; c.height = FH
    const g = c.getContext('2d')!
    frames.forEach((k, f) => {
      const px = rasterise(s, k)
      for (let i = 0; i < px.length; i++) if (px[i]) { g.fillStyle = pal[px[i]!]!; g.fillRect(f * FW + (i % FW), (i / FW) | 0, 1, 1) }
    })
    out[state] = c.toDataURL()
  }
  return out
}

export function slimeHtml(seed: number): string {
  const s = sheets(seed)
  const vars = (Object.keys(s) as State[]).map((k) => `--${k}:url(${s[k]})`).join(';')
  return `<div class="mon slime" style="${vars}"></div>`
}
