import type { Direction } from './reader'

const HAND: Record<Direction, string> = {
  left: '\u{1F448}', right: '\u{1F449}', up: '\u{1F446}', down: '\u{1F447}',
}

// Triangle, not an arrow glyph: no handedness, so it can't be drawn pointing the opposite way to the side it sits on. That shipped once.
const TRIANGLE =
  '<svg viewBox="0 0 72 65" aria-hidden="true"><path d="M27.34 5C31.18 -1.67 40.81 ' +
  '-1.67 44.66 5L70.64 50C74.49 56.67 69.67 65 61.98 65H10.01C2.32 65 -2.49 56.67 ' +
  '1.35 50L27.34 5Z"/></svg>'

// Returns data, not a DOM write, so panels.ts renders the real glyph.
export function mark(dir: Direction, kind: 'hand' | 'face'): { html: string; className: string } {
  return { html: kind === 'hand' ? HAND[dir] : TRIANGLE, className: `show at-${dir}` }
}
