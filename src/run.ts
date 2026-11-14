import { DEFAULT_FLOORS, readTell, type Tell, type TellFloors } from './tell'
import type { Direction } from './reader'

// The shape of a session: it learns you, it catches you, you get out. Three straight wins is a 1.6% event. The gap between playing a habit and playing well is 19% against 25%, six points spread across a sequence nobody can feel.

export type Stage = 'warm' | 'read' | 'reveal' | 'comeback' | 'done'

export type Ending =
  /** Caught, then pushed the read back down. The theme, completed. */
  | 'bounced'
  /** Never nameable in the first place. Rarer and better. */
  | 'never-read'
  /** Caught, and still caught when the run ran out. */
  | 'still-read'

export type RunTuning = {
  /** Exchanges before it starts using what it has learned. */
  warmExchanges: number
  /** How well it has to be predicting before a reveal is allowed. */
  readAt: number
  /** How strong the habit has to be before it is worth naming. */
  tellAt: number
  /** The read the player has to get under. */
  clearAt: number
  /** And hold, for this many exchanges running. */
  clearHold: number
  /** If it never gets a read, the run still has to end. */
  readDeadline: number
  /** And if the player cannot shake it, the same. */
  comebackDeadline: number
  /** How much evidence a habit needs before it is named. */
  floors: TellFloors
}

// Measured in scripts/measure-run.ts, not chosen.
export const DEFAULT_RUN: RunTuning = {
  warmExchanges: 6,
  readAt: 0.34,
  tellAt: 0.55,
  clearAt: 0.2,
  clearHold: 3,
  readDeadline: 28,
  comebackDeadline: 16,
  floors: DEFAULT_FLOORS,
}

export class Run {
  stage: Stage
  ending: Ending | null = null

  /** Every point the player has made this run, in order. */
  readonly choices: Direction[] = []
  /** Whether each of those points won, in the same order. */
  readonly results: boolean[] = []

  /** How well it can predict the next point, 0 to 1. */
  read = 0
  /** The worst it ever got, which is the number the end card reports. */
  peak = 0
  /** Frozen at the reveal, so the end card can name what was broken. */
  caughtBy: Tell | null = null
  readWhenCaught = 0

  readonly tuning: RunTuning
  readonly returning: boolean

  /** Exchanges since the reveal, for the comeback deadline. */
  private sinceReveal = 0
  /** The last `clearHold` reads, which is what the comeback is judged on. */
  private readonly window: number[] = []

  // @param returning True when the predictor arrived with history from an earlier visit.
  constructor(returning = false, tuning: RunTuning = DEFAULT_RUN) {
    this.returning = returning
    this.tuning = tuning
    this.stage = returning ? 'read' : 'warm'
  }

  /** True once the machine is allowed to use its model. */
  get steering(): boolean {
    return this.stage !== 'warm'
  }

  // True when the run has something to say and the game must not move on.
  get holding(): boolean {
    return this.stage === 'reveal' || this.stage === 'done'
  }

  get wins(): number {
    return this.results.filter(Boolean).length
  }

  get played(): number {
    return this.choices.length
  }

  /** Exchanges left in the warm stage, for the readout. */
  get warmLeft(): number {
    return Math.max(0, this.tuning.warmExchanges - this.choices.length)
  }

  // The read averaged over the last few exchanges, which is the number the comeback is actually judged on. Averaged because the instantaneous read swings between 8% and 37% for the same player from one exchange to the next, since it depends on which
  get recentRead(): number {
    if (this.window.length === 0) return this.read
    return this.window.reduce((a, b) => a + b, 0) / this.window.length
  }

  /** How close the comeback is, 0 to 1, for the readout. */
  get comebackProgress(): number {
    if (this.window.length < this.tuning.clearHold) {
      return this.window.length / this.tuning.clearHold * 0.5
    }
    // Past the halfway mark the bar is the average, so progress is how far under the target it has got.
    const over = Math.max(0, this.recentRead - this.tuning.clearAt)
    return 0.5 + 0.5 * Math.max(0, 1 - over / 0.3)
  }

  /** Exchanges the comeback has taken so far. */
  get comebackLength(): number {
    return this.sinceReveal
  }

  /** The best thing currently sayable about this player, tell or not. */
  get tell(): Tell | null {
    return readTell(this.choices, this.results, this.tuning.floors)
  }

  // One resolved exchange.
  observe(choice: Direction, won: boolean, read: number): void {
    if (this.stage === 'reveal' || this.stage === 'done') return

    this.choices.push(choice)
    this.results.push(won)
    this.read = read
    this.peak = Math.max(this.peak, read)
    const t = this.tuning

    switch (this.stage) {
      case 'warm':
        if (this.choices.length >= t.warmExchanges) this.stage = 'read'
        return

      case 'read': {
        // Both conditions, and the tell is the binding one. A high read with no nameable habit means it cannot explain itself, and a reveal that says "it has you" without saying how is the bluff this whole feature exists to avoid.
        const tell = this.tell
        if (read >= t.readAt && tell && tell.strength >= t.tellAt) {
          this.caughtBy = tell
          this.readWhenCaught = read
          this.stage = 'reveal'
          return
        }
        if (this.choices.length >= t.readDeadline) {
          this.ending = 'never-read'
          this.stage = 'done'
        }
        return
      }

      case 'comeback': {
        this.sinceReveal++
        this.window.push(read)
        if (this.window.length > t.clearHold) this.window.shift()
        if (this.window.length >= t.clearHold && this.recentRead <= t.clearAt) {
          this.ending = 'bounced'
          this.stage = 'done'
          return
        }
        if (this.sinceReveal >= t.comebackDeadline) {
          this.ending = 'still-read'
          this.stage = 'done'
        }
        return
      }
    }
  }

  /** The player has read the reveal and play resumes. */
  acknowledge(): void {
    if (this.stage !== 'reveal') return
    this.window.length = 0
    this.sinceReveal = 0
    this.stage = 'comeback'
  }
}
