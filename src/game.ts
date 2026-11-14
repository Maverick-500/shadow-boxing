import type { Direction } from './reader'

// The exchange. No camera, no DOM.
//
// The pointer wins on a match. You turn and it points: it already read you, so it always wins. It turns and you point: it committed first and cannot see you, so you get a real 1 in 4.

// Two contests, not two difficulties. normal guesses blind; impossible reads.
export type Mode = 'normal' | 'impossible'

export type Role =
  /** The player turns their head; the machine points. The machine wins a match. */
  | 'player-turns'
  /** The machine turns its head; the player points. The player wins a match. */
  | 'player-points'

export type Phase = 'idle' | 'centre' | 'countdown' | 'live' | 'reveal' | 'over'

// Two beats at the soundtrack's measured 160.01 BPM, so counts land on it. Was 600.
export const COUNT_MS = 750
export const COUNTDOWN_MS = COUNT_MS * 3

export type Outcome = 'won' | 'lost' | 'noInput' | 'falseStart'

export type Exchange = {
  role: Role
  /** Where the player's head went. */
  player: Direction | null
  /** Where the machine's hand or head went. */
  machine: Direction | null
  outcome: Outcome
  /** From the head starting to move to the direction being certain. */
  readMs: number | null
}

export const DIRECTIONS_ORDER = ['left', 'right', 'up', 'down'] as const

// Not moving, or moving during the count, is not a point. Both stay in history so the screen can say what happened, and out of every number derived from it.
export function counted(e: Exchange): boolean {
  return e.outcome === 'won' || e.outcome === 'lost'
}

export class Game {
  phase: Phase = 'idle'
  mode: Mode = 'normal'
  /** Exchanges the player has won. */
  score = 0
  best = 0
  /** Consecutive wins, which is the number worth chasing. */
  streak = 0
  bestStreak = 0
  history: Exchange[] = []

  // Locked at the beat, before the head moves. That is what makes the 1 in 4 real.
  machineChoice: Direction | null = null

  pending: { player: Direction; onsetAt: number; calledAt: number; revealAt: number } | null = null
  private liveUntil = 0

  // chooseMachine injected so the predictor tests alone and the game tests without one.
  constructor(private readonly chooseMachine: () => Direction = () => DIRECTIONS_ORDER[0]!) {}

  /** Derived from the mode: there is no longer any alternating. */
  get role(): Role {
    return this.mode === 'impossible' ? 'player-turns' : 'player-points'
  }

  start(mode: Mode): void {
    this.mode = mode
    this.score = 0
    this.streak = 0
    this.history = []
    this.pending = null
    this.machineChoice = null
    this.phase = 'centre'
  }

  beginCountdown(): void {
    this.pending = null
    this.machineChoice = null
    this.phase = 'countdown'
  }

  /** The beat. The machine commits here, before it can see anything. */
  beginRound(now: number, windowMs = 2400): void {
    this.pending = null
    this.liveUntil = now + windowMs
    // Locked here, before the head has moved, which is what makes the player's chance real rather than theatre.
    this.machineChoice = this.role === 'player-points' ? this.chooseMachine() : null
    this.phase = 'live'
  }

  // Impossible mode has no ending, so without this the only way out is a reload.
  stop(): void {
    this.phase = 'idle'
    this.pending = null
    this.machineChoice = null
  }

  falseStart(): void {
    if (this.phase !== 'countdown') return
    this.history.push({
      role: this.role, player: null, machine: null, outcome: 'falseStart', readMs: null,
    })
    this.phase = 'reveal'
  }

  // Resolved immediately. Nothing is left to wait for.
  commit(player: Direction, onsetAt: number, calledAt: number): void {
    if (this.phase !== 'live') return

    const machine = this.role === 'player-turns' ? player : this.machineChoice
    const matched = machine === player
    // The pointer wins a match. Which of them is pointing is the whole game.
    const playerWon = this.role === 'player-points' ? matched : !matched

    this.history.push({
      role: this.role,
      player,
      machine,
      outcome: playerWon ? 'won' : 'lost',
      readMs: Math.round(calledAt - onsetAt),
    })
    if (playerWon) {
      this.score++
      this.streak++
      this.bestStreak = Math.max(this.bestStreak, this.streak)
    } else {
      this.streak = 0
    }
    this.best = Math.max(this.best, this.score)
    this.phase = 'reveal'
  }

  expired(now: number): boolean {
    return this.phase === 'live' && now >= this.liveUntil
  }

  // Streak survives on purpose. A void exchange is not a loss.
  timeout(): void {
    if (this.phase !== 'live') return
    this.history.push({
      role: this.role, player: null, machine: this.machineChoice, outcome: 'noInput', readMs: null,
    })
    this.phase = 'reveal'
  }

  get last(): Exchange | undefined {
    return this.history[this.history.length - 1]
  }

  // Nothing ends the run. Being read is the half that is meant to be lost.
  next(): void {
    this.pending = null
    this.machineChoice = null
    this.phase = 'centre'
  }

  /** How many exchanges were thrown away as void, for the diagnostics line. */
  get voided(): number {
    return this.history.filter((h) => !counted(h)).length
  }

  /** Separate tallies, because the two halves are not the same game. */
  get tally(): { pointsPlayed: number; pointsWon: number; turnsPlayed: number; turnsWon: number } {
    const played = this.history.filter(counted)
    const points = played.filter((h) => h.role === 'player-points')
    const turns = played.filter((h) => h.role === 'player-turns')
    return {
      pointsPlayed: points.length,
      pointsWon: points.filter((h) => h.outcome === 'won').length,
      turnsPlayed: turns.length,
      turnsWon: turns.filter((h) => h.outcome === 'won').length,
    }
  }
}
