// Does the run structure actually work on anybody? Four times in this project a measuring instrument turned out to be the broken part, and twice a threshold that read as sensible in the editor was unreachable in the real distribution. The game was literally unwinnable once. So the numbers in `DEFAULT_RUN` are read off this rather than chosen. Four questions, and the last two are the ones that matter: 1. Does a player with an ordinary habit get caught? If the reveal never fires, the whole feature is dead code. 2. **Does a genuinely random player stay uncaught?** Catching them means telling a person a fact about small samples and calling it their tell. 3. **Can a caught player get out?** If the read cannot be pushed back down inside the comeback window, this is the unwinnable version again wearing a theme. 4. Is the sentence it shows them true and checkable? Run: npm run measure (bundled first, because the imports here are extensionless and the src tree is built by Vite, not by Node).

import { DIRECTIONS_ORDER } from '../src/game.ts'
import { Predictor } from '../src/predictor.ts'
import { DEFAULT_RUN, Run, type RunTuning } from '../src/run.ts'
import type { Direction } from '../src/reader.ts'

/** Deterministic, so a surprising result can be looked at twice. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const pick = (r: () => number, from: readonly Direction[]): Direction =>
  from[Math.floor(r() * from.length)]!

const OTHERS = (last: Direction | undefined): readonly Direction[] =>
  last === undefined ? DIRECTIONS_ORDER : DIRECTIONS_ORDER.filter((d) => d !== last)

type Policy = {
  name: string
  next: (past: readonly Direction[], lastWon: boolean | null, r: () => number) => Direction
}

// Nine ways to play, ordered from least to most predictable. The first is the control and the most important one: it must not get caught. The two in the middle are what actual humans do when told to be random, and are the ones the thresholds are really set for.
const POLICIES: readonly Policy[] = [
  {
    name: 'truly random',
    next: (_p, _w, r) => pick(r, DIRECTIONS_ORDER),
  },
  {
    // The strongest documented bias in human attempts at randomness.
    name: 'never repeats',
    next: (p, _w, r) => pick(r, OTHERS(p[p.length - 1])),
  },
  {
    // Never repeats and never doubles back, which is what random feels like from the inside and is far more predictable than it looks.
    name: 'avoids last two',
    next: (p, _w, r) => {
      const a = p[p.length - 1]
      const b = p[p.length - 2]
      const open = DIRECTIONS_ORDER.filter((d) => d !== a && d !== b)
      return pick(r, open.length > 0 ? open : OTHERS(a))
    },
  },
  {
    name: 'favours left',
    next: (_p, _w, r) => (r() < 0.45 ? 'left' : pick(r, DIRECTIONS_ORDER)),
  },
  {
    name: 'never repeats, favours left',
    next: (p, _w, r) => {
      const open = OTHERS(p[p.length - 1])
      if (open.includes('left') && r() < 0.45) return 'left'
      return pick(r, open)
    },
  },
  {
    name: 'after left goes up',
    next: (p, _w, r) => (p[p.length - 1] === 'left' ? 'up' : pick(r, OTHERS(p[p.length - 1]))),
  },
  {
    name: 'shifts left on a loss',
    next: (p, won, r) => (won === false ? 'left' : pick(r, OTHERS(p[p.length - 1]))),
  },
  {
    name: 'alternates two',
    next: (p) => (p[p.length - 1] === 'left' ? 'right' : 'left'),
  },
  {
    name: 'cycles four',
    next: (p) => {
      const i = DIRECTIONS_ORDER.indexOf(p[p.length - 1] ?? 'down')
      return DIRECTIONS_ORDER[(i + 1) % 4]!
    },
  },
]

type Result = {
  caughtAt: number | null
  readWhenCaught: number
  tell: string
  peak: number
  escapeReads: number[]
  escapedIn: number | null
  winRate: number
  ending: string
  played: number
}

// One full session. `reform` is the question in the title: at the reveal the player stops being themselves and starts choosing freely, which is the best a human can do once told what their habit was. If the read does not fall for that player, it cannot fall for anybody, and the comeback is decoration.
function session(policy: Policy, seed: number, reform: boolean, tuning: RunTuning): Result {
  const r = rng(seed)
  const predictor = new Predictor()
  const run = new Run(false, tuning)
  let lastWon: boolean | null = null
  const escapeReads: number[] = []
  let caughtAt: number | null = null
  let escapedIn: number | null = null

  for (let i = 0; i < 300 && run.stage !== 'done'; i++) {
    if (run.stage === 'reveal') {
      caughtAt = run.played
      run.acknowledge()
      continue
    }
    const choice = reform && caughtAt !== null
      ? pick(r, DIRECTIONS_ORDER)
      : policy.next(run.choices, lastWon, r)
    const machine = run.steering ? predictor.choose(r) : pick(r, DIRECTIONS_ORDER)
    // The pointer wins on a match, so the player wins by matching.
    const won = machine === choice
    predictor.observe(choice, won)
    run.observe(choice, won, predictor.confidence)
    if (caughtAt !== null) {
      escapeReads.push(predictor.confidence)
      if (run.ending === 'bounced' && escapedIn === null) escapedIn = escapeReads.length
    }
    lastWon = won
  }

  return {
    caughtAt,
    readWhenCaught: run.readWhenCaught,
    tell: run.caughtBy?.text ?? '(none)',
    peak: run.peak,
    escapeReads,
    escapedIn,
    winRate: run.played > 0 ? run.wins / run.played : 0,
    ending: run.ending ?? '(unfinished)',
    played: run.played,
  }
}

const RUNS = 80
const pct = (x: number): string => `${Math.round(x * 100)}%`
const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function trial(policy: Policy, reform: boolean, tuning: RunTuning): Result[] {
  const out: Result[] = []
  for (let s = 0; s < RUNS; s++) out.push(session(policy, 1000 + s * 7919, reform, tuning))
  return out
}

// The sweep: where do the two gates have to sit
//
// The control policy is the one that decides this. A gate that catches random players is not a gate, and no amount of catching real patterns makes up for it, because the player cannot tell which kind of catch they got.

console.log('── gate sweep: false catch against real catch, and how soon ───')
console.log('The first column is the one that decides it. A gate that catches a random')
console.log('player is not a gate, however well it catches real patterns, because the')
console.log('player cannot tell which kind of catch they got.\n')
const SWEEP = POLICIES.slice(0, 6)
console.log('repeat  read  ' + SWEEP.map((p) => p.name.slice(0, 13).padStart(14)).join(''))
for (const repeat of [1.9, 2.2, 2.6]) {
  for (const readAt of [0.3, 0.34, 0.4]) {
    const tuning: RunTuning = {
      ...DEFAULT_RUN, readAt, floors: { ...DEFAULT_RUN.floors, repeat },
    }
    const cells = SWEEP.map((p) => {
      const rs = trial(p, false, tuning)
      const caught = rs.filter((x) => x.caughtAt !== null)
      const at = caught.length ? Math.round(avg(caught.map((x) => x.caughtAt ?? 0))) : 0
      return `${pct(caught.length / RUNS)}${caught.length ? ` @${at}` : ''}`.padStart(14)
    })
    console.log(`${repeat.toFixed(1)}    ${readAt.toFixed(2)}  ${cells.join('')}`)
  }
}

// The run as it will ship

for (const reform of [false, true]) {
  console.log(`\n── ${reform ? 'player reforms at the reveal' : 'player never changes'} ──────────────`)
  console.log(
    'policy'.padEnd(29) + 'caught'.padStart(7) + 'at'.padStart(5) + 'read'.padStart(6) +
    'peak'.padStart(6) + 'win'.padStart(6) + 'out'.padStart(6) + 'in'.padStart(4) + '   ending')
  for (const policy of POLICIES) {
    const rs = trial(policy, reform, DEFAULT_RUN)
    const caught = rs.filter((x) => x.caughtAt !== null)
    const escaped = rs.filter((x) => x.ending === 'bounced')
    const endings = new Map<string, number>()
    for (const x of rs) endings.set(x.ending, (endings.get(x.ending) ?? 0) + 1)
    console.log(
      policy.name.padEnd(29) +
      pct(caught.length / RUNS).padStart(7) +
      `${caught.length ? Math.round(avg(caught.map((x) => x.caughtAt ?? 0))) : '-'}`.padStart(5) +
      pct(avg(caught.map((x) => x.readWhenCaught))).padStart(6) +
      pct(avg(rs.map((x) => x.peak))).padStart(6) +
      pct(avg(rs.map((x) => x.winRate))).padStart(6) +
      `${caught.length ? Math.round((escaped.length / caught.length) * 100) : 0}%`.padStart(6) +
      `${escaped.length ? Math.round(avg(escaped.map((x) => x.escapedIn ?? 0))) : '-'}`.padStart(4) +
      '   ' + [...endings.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`).join(', '),
    )
  }
}

// What it actually says to people

console.log('\n── the sentence, one per policy ───────────────────────────────')
for (const policy of POLICIES) {
  for (let s = 0; s < 20; s++) {
    const out = session(policy, 1000 + s * 7919, false, DEFAULT_RUN)
    if (out.caughtAt !== null) {
      console.log(`${policy.name.padEnd(29)} round ${String(out.caughtAt).padStart(2)}  ${out.tell}`)
      break
    }
  }
}

// The escape curve
//
// Shown round by round rather than as an average, because the question is not whether the read falls eventually but whether it falls fast enough to be felt as a comeback rather than as waiting.

console.log('\n── read per exchange after reforming ─────────────────────────')
for (const name of ['never repeats, favours left', 'cycles four', 'shifts left on a loss']) {
  const policy = POLICIES.find((p) => p.name === name)!
  for (let s = 0; s < 20; s++) {
    const out = session(policy, 1000 + s * 7919, true, DEFAULT_RUN)
    if (out.caughtAt !== null) {
      console.log(`${name}: caught round ${out.caughtAt} on ${pct(out.readWhenCaught)}`)
      console.log(`  ${out.escapeReads.map((x) => pct(x).padStart(4)).join(' ')}  ${out.ending}`)
      break
    }
  }
}
