// The player figure, assembled from Kenney's Toon Characters parts (CC0) so the head can turn on its own.

export type Face = 'neutral' | 'focus' | 'shock'
export type Pose = { dx: number; dy: number; tilt: number; sx: number; sy: number; face: Face; punch: number; shake: number }

// Relative, so it resolves from the page on Vercel and from a subdirectory on itch.
const P = 'hero/'
const FACES: Record<Face, string> = { neutral: 'head', focus: 'headFocus', shock: 'headShock' }

// Canvas 200x260, parts at Kenney's HD size.
const W = 200, CX = 100
const img = (href: string, x: number, y: number, w: number, h: number, extra = ''): string =>
  `<image href="${P}${href}.png" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`

export function heroSvg(): string {
  const leg = { w: 36, h: 58 }
  const body = { w: 74, h: 78 }
  const arm = { w: 42, h: 60 }
  const hand = { w: 37, h: 34 }
  const head = { w: 113, h: 121 }
  const bodyY = 124, bodyX = CX - body.w / 2
  const legY = bodyY + body.h - 8
  const armY = bodyY + 4, armX = bodyX + body.w - 14
  // Mirrored about the figure's centre line, for the left-hand limbs.
  const mirrored = (href: string, x: number, y: number, w: number, h: number): string =>
    `<g transform="translate(${W} 0) scale(-1 1)">${img(href, x, y, w, h)}</g>`
  return `
<svg viewBox="0 0 ${W} 260" aria-hidden="true" overflow="visible">
  <ellipse cx="${CX}" cy="252" rx="58" ry="7" fill="#000" opacity=".45"/>
  <g id="heroAll">
    ${mirrored('leg', CX - 2, legY, leg.w, leg.h)}
    ${img('leg', CX - 2, legY, leg.w, leg.h)}
    ${mirrored('arm', armX, armY, arm.w, arm.h)}
    ${mirrored('hand', armX + 4, armY + arm.h - 10, hand.w, hand.h)}
    ${img('body', bodyX, bodyY, body.w, body.h)}
    <g id="punchArm">
      ${img('arm', armX, armY, arm.w, arm.h)}
      ${img('hand', armX + 4, armY + arm.h - 10, hand.w, hand.h)}
    </g>
    <g id="heroHead">${img('head', CX - head.w / 2, bodyY - head.h + 26, head.w, head.h, 'id="heroFace"')}</g>
  </g>
</svg>`
}

// Neck and shoulder pivots, matching the layout above.
const NECK = { x: CX, y: 140 }
const SHOULDER = { x: 100 + 37 - 14 + 21, y: 132 }

export function poseHero(root: Element, p: Pose): void {
  const head = root.querySelector('#heroHead') as SVGGElement
  const face = root.querySelector('#heroFace') as SVGImageElement
  const arm = root.querySelector('#punchArm') as SVGGElement
  const all = root.querySelector('#heroAll') as SVGGElement
  head.setAttribute('transform',
    `translate(${p.dx} ${p.dy}) rotate(${p.tilt} ${NECK.x} ${NECK.y}) ` +
    `translate(${NECK.x} ${NECK.y}) scale(${p.sx} ${p.sy}) translate(${-NECK.x} ${-NECK.y})`)
  const href = `${P}${FACES[p.face]}.png`
  if (face.getAttribute('href') !== href) face.setAttribute('href', href)
  arm.setAttribute('transform', `rotate(${-95 * p.punch} ${SHOULDER.x} ${SHOULDER.y})`)
  all.setAttribute('transform', `translate(${p.shake * 9} 0)`)
}

export const LOOK = {
  centre: { dx: 0, dy: 0, tilt: 0, sx: 1, sy: 1 },
  left: { dx: -14, dy: 2, tilt: -14, sx: 0.9, sy: 1 },
  right: { dx: 14, dy: 2, tilt: 14, sx: 0.9, sy: 1 },
  up: { dx: 0, dy: -12, tilt: 0, sx: 1, sy: 0.92 },
  down: { dx: 0, dy: 10, tilt: 0, sx: 1, sy: 0.92 },
}
