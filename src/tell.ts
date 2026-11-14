import { DIRECTIONS_ORDER } from './game'
import type { Direction } from './reader'

// Says out loud what the player keeps doing. The first version caught a simulated player who was choosing uniformly at random 32% of the time, and told them "after left you go right, four times out of five".

export type Tell = {
  /** The habit, with its evidence, in one sentence. */
  text: string
  /** What breaking it looks like, as an instruction. */
  counter: string
  /** 0 when this is just chance, 1 when it is beyond argument. */
  strength: number
}

// How big a deviation has to be before a detector is allowed to speak, in standard deviations, and how much evidence it needs first.
export type TellFloors = {
  /** One cell. Low, because it is also the most recognisable habit there is. */
  repeat: number
  /** Best of four. */
  four: number
  /** Best of sixteen. */
  sixteen: number
}

export const DEFAULT_FLOORS: TellFloors = { repeat: 2.2, four: 3.1, sixteen: 3.6 }

const WORD = ['once', 'twice', 'three times', 'four times', 'five times'] as const

/** "nine times" and "twice" read very differently in the same slot. */
function times(n: number): string {
  return WORD[n - 1] ?? `${n} times`
}

// How far from chance, in standard deviations, or 0 if it does not clear the floor for how many cells were searched.
function sigma(k: number, n: number, p0: number, floor: number): number {
  if (n <= 0) return 0
  const sd = Math.sqrt((p0 * (1 - p0)) / n)
  if (sd <= 0) return 0
  const z = Math.abs((k / n - p0) / sd)
  return z >= floor ? Math.min(1, z / 4) : 0
}

type Detector = (
  choices: readonly Direction[],
  results: readonly boolean[],
  floors: TellFloors,
) => Tell | null

// Repeats, in both directions.
const repeats: Detector = (choices, _results, floors) => {
  const chances = choices.length - 1
  if (chances < 10) return null
  let repeated = 0
  for (let i = 1; i < choices.length; i++) if (choices[i] === choices[i - 1]) repeated++
  const strength = sigma(repeated, chances, 0.25, floors.repeat)
  if (strength === 0) return null
  const expected = Math.round(chances * 0.25)
  if (repeated < chances * 0.25) {
    return {
      text: repeated === 0
        ? `You have never pointed the same way twice. In ${chances} chances, that should have happened about ${expected} times.`
        : `You have repeated a direction ${times(repeated)} in ${chances} chances. Chance would be about ${expected}.`,
      counter: 'Point the same way twice in a row.',
      strength,
    }
  }
  return {
    text: `${times(repeated)} in ${chances}, you pointed the same way as the point before. Chance would be about ${expected}.`,
    counter: 'Stop following yourself. Move after every point.',
    strength,
  }
}

/** A direction used far more than its share. Four cells searched. */
const favourite: Detector = (choices, _results, floors) => {
  if (choices.length < 10) return null
  const counts = tally(choices)
  let best: Direction = DIRECTIONS_ORDER[0]
  for (const d of DIRECTIONS_ORDER) if (counts[d] > counts[best]) best = d
  const strength = sigma(counts[best], choices.length, 0.25, floors.four)
  if (strength === 0 || counts[best] <= choices.length * 0.25) return null
  return {
    text: `${counts[best]} of your ${choices.length} points went ${best}.`,
    counter: `Spend the other three as often as you spend ${best}.`,
    strength,
  }
}

/** A direction barely used, which is as exploitable as a favourite. */
const neglected: Detector = (choices, _results, floors) => {
  if (choices.length < 14) return null
  const counts = tally(choices)
  let worst: Direction = DIRECTIONS_ORDER[0]
  for (const d of DIRECTIONS_ORDER) if (counts[d] < counts[worst]) worst = d
  const strength = sigma(counts[worst], choices.length, 0.25, floors.four)
  if (strength === 0 || counts[worst] >= choices.length * 0.25) return null
  return {
    text: counts[worst] === 0
      ? `In ${choices.length} points you have never gone ${worst}.`
      : `You have gone ${worst} ${times(counts[worst])} in ${choices.length} points.`,
    counter: `Use ${worst}.`,
    strength,
  }
}

// A pair: what reliably follows one particular direction.
const pair: Detector = (choices, _results, floors) => {
  if (choices.length < 14) return null
  let out: Tell | null = null
  let bestStrength = 0
  for (const from of DIRECTIONS_ORDER) {
    const next: Direction[] = []
    for (let i = 1; i < choices.length; i++) if (choices[i - 1] === from) next.push(choices[i]!)
    if (next.length < 6) continue
    const counts = tally(next)
    for (const to of DIRECTIONS_ORDER) {
      if (counts[to] <= next.length * 0.25) continue
      const strength = sigma(counts[to], next.length, 0.25, floors.sixteen)
      if (strength <= bestStrength) continue
      bestStrength = strength
      out = {
        text: `After ${from} you go ${to}, ${counts[to]} times out of ${next.length}.`,
        counter: `Go somewhere other than ${to} the next time you have just gone ${from}.`,
        strength,
      }
    }
  }
  return out
}

// What losing does to the next choice.
const afterLoss: Detector = (choices, results, floors) => {
  const next: Direction[] = []
  for (let i = 1; i < choices.length; i++) if (results[i - 1] === false) next.push(choices[i]!)
  if (next.length < 10) return null
  // When every exchange was a loss, which is the whole of impossible mode by construction, this detector is `favourite` wearing a sentence that blames losing for it. A claim about what losing changes needs something to have changed from, so with no wins in the sample there is nothing to say.
  if (next.length >= choices.length - 1) return null
  const counts = tally(next)
  let best: Direction = DIRECTIONS_ORDER[0]
  for (const d of DIRECTIONS_ORDER) if (counts[d] > counts[best]) best = d
  const strength = sigma(counts[best], next.length, 0.25, floors.four)
  if (strength === 0 || counts[best] <= next.length * 0.25) return null
  return {
    text: `When you lose, your next point goes ${best}, ${counts[best]} times out of ${next.length}.`,
    counter: 'Do not let the last result choose for you.',
    strength,
  }
}

// Order matters only for exact ties, and ties only happen when two detectors are both pinned at the cap, which is common for a rigid habit.
const DETECTORS: readonly Detector[] = [favourite, pair, afterLoss, repeats, neglected]

// The strongest true thing that can be said about this player, or nothing.
export function readTell(
  choices: readonly Direction[],
  results: readonly boolean[],
  floors: TellFloors = DEFAULT_FLOORS,
): Tell | null {
  let best: Tell | null = null
  for (const detect of DETECTORS) {
    const found = detect(choices, results, floors)
    if (found && (!best || found.strength > best.strength)) best = found
  }
  return best
}

function tally(choices: readonly Direction[]): Record<Direction, number> {
  const counts: Record<Direction, number> = { left: 0, right: 0, up: 0, down: 0 }
  for (const c of choices) counts[c]++
  return counts
}
