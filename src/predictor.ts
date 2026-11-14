import { DIRECTIONS_ORDER } from './game'
import type { Direction } from './reader'

// Guesses where the player will point next.

type Counts = Record<Direction, number>

const zero = (): Counts => ({ left: 0, right: 0, up: 0, down: 0 })

const key = (dirs: readonly Direction[]): string => dirs.join('>')

// What people do when asked to be random, before this player has done anything.
const REPEAT_PRIOR = 0.45

type Expert = {
  name: string
  /** Probability the player picks each direction next. */
  predict: (history: Direction[]) => Counts | null
  weight: number
}

/** Pooled counts from everyone who has played, as served by `/api/prior`. */
export type Prior = {
  order1: Record<string, Record<string, number>>
  order2: Record<string, Record<string, number>>
  afterLoss: Record<string, Record<string, number>>
  total: number
}

export class Predictor {
  private history: Direction[] = []
  private overall = zero()
  private order1 = new Map<string, Counts>()
  private order2 = new Map<string, Counts>()
  private prior: Prior | null = null
  /** Whether the previous exchange went the player's way, for the shift expert. */
  private lastWon: boolean | null = null

  private experts: Expert[] = [
    {
      name: 'frequency',
      weight: 1,
      predict: () => (this.history.length >= 3 ? { ...this.overall } : null),
    },
    {
      name: 'last-one',
      weight: 1,
      predict: (h) => {
        if (h.length < 1) return null
        const c = this.order1.get(key(h.slice(-1)))
        return c && total(c) >= 2 ? { ...c } : null
      },
    },
    {
      name: 'last-two',
      weight: 1,
      predict: (h) => {
        if (h.length < 2) return null
        const c = this.order2.get(key(h.slice(-2)))
        return c && total(c) >= 2 ? { ...c } : null
      },
    },
    {
      // What everybody else did from here. Weighted like any other expert, so if this player is nothing like the crowd it quietly loses its say rather than dragging every guess toward the average human.
      name: 'crowd-order2',
      weight: 1,
      predict: (h) => {
        if (!this.prior || h.length < 2) return null
        const c = this.prior.order2[key(h.slice(-2))]
        return c && sumRecord(c) >= 8 ? fromRecord(c) : null
      },
    },
    {
      name: 'crowd-order1',
      weight: 1,
      predict: (h) => {
        if (!this.prior || h.length < 1) return null
        const c = this.prior.order1[key(h.slice(-1))]
        return c && sumRecord(c) >= 8 ? fromRecord(c) : null
      },
    },
    {
      // People shift after a loss, and the pooled data is the only way to know whether they shift in a particular direction rather than just away.
      name: 'crowd-after-result',
      weight: 1,
      predict: () => {
        if (!this.prior || this.lastWon === null) return null
        const c = this.prior.afterLoss[this.lastWon ? 'won' : 'lost']
        return c && sumRecord(c) >= 20 ? fromRecord(c) : null
      },
    },
    {
      name: 'avoids-repeats',
      weight: 1,
      predict: (h) => {
        if (h.length < 1) return null
        const last = h[h.length - 1]!
        const c = zero()
        for (const d of DIRECTIONS_ORDER) c[d] = d === last ? REPEAT_PRIOR : 1
        return c
      },
    },
  ]

  /** Blended prediction over the player's next choice, as probabilities. */
  distribution(): Counts {
    const blended = zero()
    let any = false
    for (const e of this.experts) {
      const raw = e.predict(this.history)
      if (!raw) continue
      any = true
      const sum = total(raw) || 1
      for (const d of DIRECTIONS_ORDER) blended[d] += (raw[d] / sum) * e.weight
    }
    if (!any) {
      // Nothing to go on yet, so fall back to the bias everybody has.
      for (const d of DIRECTIONS_ORDER) blended[d] = 1
    }
    const sum = total(blended) || 1
    for (const d of DIRECTIONS_ORDER) blended[d] /= sum
    return blended
  }

  // The direction the machine should turn, avoiding where it expects the player.
  choose(random: () => number = Math.random): Direction {
    const p = this.distribution()
    const weights = DIRECTIONS_ORDER.map((d) => Math.pow(Math.max(0, 1 - p[d]), 3))
    const sum = weights.reduce((a, b) => a + b, 0) || 1
    let r = random() * sum
    for (let i = 0; i < DIRECTIONS_ORDER.length; i++) {
      r -= weights[i]!
      if (r <= 0) return DIRECTIONS_ORDER[i]!
    }
    return DIRECTIONS_ORDER[DIRECTIONS_ORDER.length - 1]!
  }

  /** Installs pooled counts. Safe to call late, or never. */
  usePrior(prior: Prior): void {
    this.prior = prior
  }

  get pooled(): number {
    return this.prior?.total ?? 0
  }

  /** Records what the player actually did, and re-weights the experts. */
  observe(choice: Direction, won?: boolean): void {
    // Scored before the counts are updated, or every expert gets credit for knowing something it only learned from this very observation.
    for (const e of this.experts) {
      const raw = e.predict(this.history)
      if (!raw) continue
      const sum = total(raw) || 1
      const correctness = raw[choice] / sum
      // Decayed, so an expert that was right ten rounds ago and wrong since loses its say instead of coasting on history.
      e.weight = e.weight * 0.82 + correctness * 4 * 0.18
      e.weight = Math.max(0.05, Math.min(4, e.weight))
    }

    this.overall[choice]++
    if (this.history.length >= 1) {
      bump(this.order1, key(this.history.slice(-1)), choice)
    }
    if (this.history.length >= 2) {
      bump(this.order2, key(this.history.slice(-2)), choice)
    }
    this.history.push(choice)
    if (this.history.length > 400) this.history.shift()
    if (won !== undefined) this.lastWon = won
  }

  /** How sure it is, 0 when it has no idea and 1 when it is certain. */
  get confidence(): number {
    const p = this.distribution()
    const max = Math.max(...DIRECTIONS_ORDER.map((d) => p[d]))
    return Math.max(0, (max - 0.25) / 0.75)
  }

  get seen(): number {
    return this.history.length
  }

  // Forgets this player completely, and deliberately keeps the pooled prior.
  reset(): void {
    this.history = []
    this.overall = zero()
    this.order1.clear()
    this.order2.clear()
    this.lastWon = null
    for (const e of this.experts) e.weight = 1
  }

  /** Session memory, so a returning player is not met by a blank slate. */
  save(): string {
    return JSON.stringify({ history: this.history.slice(-200) })
  }

  load(raw: string): void {
    try {
      const data = JSON.parse(raw) as { history?: Direction[] }
      for (const d of data.history ?? []) {
        if (DIRECTIONS_ORDER.includes(d)) this.observe(d)
      }
    } catch {
      // A corrupt or outdated blob is not worth a crash on the start screen.
    }
  }
}

const total = (c: Counts): number =>
  c.left + c.right + c.up + c.down

const sumRecord = (r: Record<string, number>): number =>
  DIRECTIONS_ORDER.reduce((a, d) => a + (r[d] ?? 0), 0)

function fromRecord(r: Record<string, number>): Counts {
  const c = zero()
  for (const d of DIRECTIONS_ORDER) c[d] = r[d] ?? 0
  return c
}

function bump(map: Map<string, Counts>, k: string, choice: Direction): void {
  const c = map.get(k) ?? zero()
  c[choice]++
  map.set(k, c)
}
