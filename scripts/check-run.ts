// Drives the real `Game` and `Run` through a full session, wired the same way `main.ts` wires them, and asserts the things that would be invisible until somebody played it at a table. Why this exists rather than a click through in a browser: the reveal fires after fifteen to twenty exchanges of a specific habit, which is two minutes of deliberately turning your head the same way in front of a webcam, per attempt. Every bug in the stage machine would cost that, and the two bugs most likely to be here are both of the kind that look fine on screen: the game resuming underneath the reveal, and the run never reaching an ending. Run: npm run check:run

import { COUNT_MS, DIRECTIONS_ORDER, Game } from '../src/game.ts'
import { Predictor } from '../src/predictor.ts'
import { DEFAULT_RUN, Run } from '../src/run.ts'
import { asOdds } from '../src/panel.ts'
import { readTell } from '../src/tell.ts'
import { LANDING_GRID, landingTime } from '../src/audio.ts'
import type { Direction } from '../src/reader.ts'

let failures = 0

function ok(claim: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${claim}`)
  } else {
    failures++
    console.log(`  FAIL  ${claim}${detail ? `   ${detail}` : ''}`)
  }
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// One exchange, through the real `Game`, in the order `main.ts` does it. The order is the point. The machine commits at the beat, before the head moves, and the predictor and the run are both fed afterwards, so nothing about this exchange can have influenced the choice the player was up against. Getting that backwards would make the game unloseable and the bug would not show up anywhere except in the win rate.
function exchange(
  game: Game,
  predictor: Predictor,
  run: Run,
  choice: Direction,
  now: number,
): { machine: Direction | null; won: boolean } {
  game.beginCountdown()
  game.beginRound(now)
  const machine = game.machineChoice
  game.commit(choice, now, now + 120)
  const e = game.last!
  const won = e.outcome === 'won'
  predictor.observe(choice, won)
  run.observe(choice, won, predictor.confidence)
  return { machine, won }
}

// The warm stage

console.log('\nwarm stage')
{
  const predictor = new Predictor()
  const run = new Run(false)
  const r = rng(99)
  const pickUniform = (): Direction =>
    DIRECTIONS_ORDER[Math.floor(r() * DIRECTIONS_ORDER.length)]!
  let consulted = 0
  const game = new Game(() => {
    if (!run.steering) return pickUniform()
    consulted++
    return predictor.choose()
  })

  ok('starts in warm', run.stage === 'warm', run.stage)
  ok('not steering yet', !run.steering)

  game.start('normal')
  for (let i = 0; i < 6; i++) {
    exchange(game, predictor, run, 'left', i * 1000)
    game.next()
  }
  ok('warm lasts six exchanges', run.played === 6, `played ${run.played}`)
  ok('leaves warm on the sixth', run.stage === 'read', run.stage)
  ok('now steering', run.steering)
  // Asked directly rather than inferred from where the machine happened to look. Six draws cannot tell you whether a model was consulted, and an earlier version of this check failed on a run where the game was correct.
  ok('the model is not consulted during warm', consulted === 0, `${consulted} calls`)
  exchange(game, predictor, run, 'left', 9000)
  game.next()
  ok('the model is consulted after warm', consulted === 1, `${consulted} calls`)
  ok('no tell nameable yet', run.tell === null)
}

// Catch, hold, and get out

console.log('\na habit, caught and broken')
{
  const predictor = new Predictor()
  const run = new Run(false)
  const game = new Game(() => (run.steering ? predictor.choose() : 'up'))
  const r = rng(4242)
  let caughtAtPhase = ''
  let heldFor = 0

  game.start('normal')
  // Alternates, which is the second most common thing a human does and is caught every time in the sweep.
  let last: Direction = 'right'
  for (let i = 0; i < 200 && run.stage !== 'done'; i++) {
    if (run.stage === 'reveal') {
      // This is the bug that would be invisible: the game must not advance past the reveal on its own.
      caughtAtPhase = game.phase
      const before = run.played
      for (let held = 0; held < 5; held++) {
        run.observe('left', false, 0.9)
        heldFor++
      }
      ok('reveal holds the game in the reveal phase', caughtAtPhase === 'reveal', caughtAtPhase)
      ok('exchanges cannot land while the reveal is up', run.played === before,
        `${before} then ${run.played}`)
      run.acknowledge()
      ok('acknowledge moves to the comeback', run.stage === 'comeback', run.stage)
      ok('acknowledge discards nothing', run.played === before)
      game.next()
      continue
    }
    const choice: Direction = run.stage === 'comeback'
      ? DIRECTIONS_ORDER[Math.floor(r() * 4)]!
      : last === 'left' ? 'right' : 'left'
    last = choice
    exchange(game, predictor, run, choice, i * 1000)
    // Exactly what the frame loop does, from the same rule.
    if (!run.holding) game.next()
  }

  ok('the run reaches an ending', run.stage === 'done' && run.ending !== null, String(run.ending))
  ok('it was caught', run.caughtBy !== null)
  ok('the tell carries its evidence', /\d/.test(run.caughtBy?.text ?? ''), run.caughtBy?.text ?? '')
  ok('the tell carries a counter', (run.caughtBy?.counter ?? '').length > 8)
  ok('a player who starts choosing freely gets out', run.ending === 'bounced', String(run.ending))
  ok('the peak read is recorded', run.peak >= run.readWhenCaught)
  ok('held observes did not leak into the record', heldFor === 5 && run.played < 200)
  console.log(`        caught on ${Math.round(run.readWhenCaught * 100)}%: ${run.caughtBy?.text}`)
  console.log(`        out in ${run.comebackLength} points, down to ${Math.round(run.recentRead * 100)}%`)
}

// A player it cannot name

console.log('\nnothing to say')
{
  const predictor = new Predictor()
  const run = new Run(false)
  const game = new Game(() => (run.steering ? predictor.choose() : 'up'))
  const r = rng(7)
  game.start('normal')
  for (let i = 0; i < 200 && run.stage !== 'done'; i++) {
    if (run.stage === 'reveal') { run.acknowledge(); game.next(); continue }
    exchange(game, predictor, run, DIRECTIONS_ORDER[Math.floor(r() * 4)]!, i * 1000)
    if (!run.holding) game.next()
  }
  ok('the run still ends', run.stage === 'done')
  ok('ends without inventing a habit', run.ending === 'never-read' || run.caughtBy !== null,
    String(run.ending))
  console.log(`        ${run.played} points, ending ${run.ending}, peak ${Math.round(run.peak * 100)}%`)
}

// Void exchanges

console.log('\nnot moving, and moving early')
{
  const predictor = new Predictor()
  const run = new Run(false)
  const game = new Game(() => (run.steering ? predictor.choose() : 'up'))
  game.start('normal')

  // Two real points first, so there is a streak and a tally to protect.
  for (let i = 0; i < 2; i++) {
    game.beginCountdown()
    game.beginRound(i * 1000)
    game.commit(game.machineChoice!, i * 1000, i * 1000 + 120)
    game.next()
  }
  const wonBefore = game.tally.pointsWon
  const playedBefore = game.tally.pointsPlayed
  const streakBefore = game.streak
  ok('two points landed', playedBefore === 2 && wonBefore === 2, `${wonBefore}/${playedBefore}`)
  ok('a streak exists to lose', streakBefore === 2, String(streakBefore))

  // Did not move.
  game.beginCountdown()
  game.beginRound(9000)
  game.timeout()
  ok('no input is not played', game.tally.pointsPlayed === playedBefore,
    `${game.tally.pointsPlayed}`)
  ok('no input does not break the streak', game.streak === streakBefore, String(game.streak))
  game.next()

  // Moved during the count.
  game.beginCountdown()
  game.falseStart()
  ok('a false start is not played', game.tally.pointsPlayed === playedBefore,
    `${game.tally.pointsPlayed}`)
  ok('a false start does not break the streak', game.streak === streakBefore, String(game.streak))

  ok('both are still on the record', game.voided === 2, String(game.voided))
  ok('the win rate is unmoved', game.tally.pointsWon === wonBefore)
  ok('the last exchange can still be described', game.last?.outcome === 'falseStart',
    String(game.last?.outcome))
}

// The arc in impossible mode

console.log('\nimpossible mode still has a run in it')
{
  const predictor = new Predictor()
  // Skips warm, exactly as main.ts starts it.
  const run = new Run(true)
  const game = new Game(() => 'up')
  const r = rng(31337)
  game.start('impossible')
  let caught = false
  let everWon = false

  let last: Direction = 'right'
  for (let i = 0; i < 200 && run.stage !== 'done'; i++) {
    if (run.stage === 'reveal') { caught = true; run.acknowledge(); game.next(); continue }
    const choice: Direction = caught
      ? DIRECTIONS_ORDER[Math.floor(r() * 4)]!
      : last === 'left' ? 'right' : 'left'
    last = choice
    const { won } = exchange(game, predictor, run, choice, i * 1000)
    if (won) everWon = true
    if (!run.holding) game.next()
  }

  ok('the player never wins an exchange', !everWon)
  ok('it still names a habit', run.caughtBy !== null, String(run.caughtBy?.text))
  ok('the tell carries its evidence', /\d/.test(run.caughtBy?.text ?? ''))
  // The point of the whole change: losing every exchange and still getting out.
  ok('a comeback is still reachable', run.ending === 'bounced', String(run.ending))
  ok('getting out did not require a win', game.tally.turnsWon === 0,
    `${game.tally.turnsWon} wins`)
  console.log(`        caught on ${Math.round(run.readWhenCaught * 100)}%: ${run.caughtBy?.text}`)
  console.log(`        out in ${run.comebackLength} turns, down to ${Math.round(run.recentRead * 100)}%`)
}

// The handover

console.log('\nthe next person in the queue')
{
  const predictor = new Predictor()
  for (let i = 0; i < 40; i++) predictor.observe(i % 2 === 0 ? 'left' : 'right', false)
  ok('it learned the alternation', predictor.confidence > 0.5,
    predictor.confidence.toFixed(2))
  const before = predictor.seen

  predictor.reset()
  ok('the next player is not inherited', predictor.seen === 0, `${before} then ${predictor.seen}`)
  ok('and nothing is claimed about them', predictor.confidence === 0,
    predictor.confidence.toFixed(2))
  ok('a fresh run says nothing', readTell([], []) === null)
}

// The beat the countdown hangs off

console.log('\nthe countdown lands on the grid')
{
  // The shipping values, not a copy of them. The grid and the count are tied to the soundtrack's measured tempo, and a test carrying its own numbers would keep passing after the track changed.
  const COUNT = COUNT_MS / 1000
  const GRID = LANDING_GRID
  let worstWait = 0
  let ok1 = true
  let ok2 = true
  let ok3 = true
  // Across a whole grid unit of possible arrival times, in 5ms steps, because the player arrives whenever they arrive.
  for (let i = 0; i < Math.ceil(GRID / 0.005); i++) {
    const now = i * 0.005
    const landing = landingTime(now, 0, COUNT, GRID)
    // It must never schedule the beat into the past, or sooner than the three counts need, or the first digit is already gone when it appears.
    if (landing < now + 0.12 + COUNT * 3 - 1e-9) ok1 = false
    // It must actually be on the grid, or none of this was worth doing.
    if (Math.abs(landing / GRID - Math.round(landing / GRID)) > 1e-9) ok2 = false
    const wait = landing - (now + 0.12 + COUNT * 3)
    worstWait = Math.max(worstWait, wait)
    // And it must never hold a player standing there for more than one unit.
    if (wait > GRID + 1e-9) ok3 = false
  }
  ok('never schedules the beat too soon', ok1)
  ok('always lands on the grid', ok2)
  ok('never waits more than one grid unit', ok3, `worst ${worstWait.toFixed(3)}s`)
  // Within a millisecond, not exactly. The count is a round 750ms because it is a human-facing countdown; the grid is two beats of a track measured at 160.01 BPM, so 749.95ms. The 0.05ms between them is inaudible and cannot accumulate, because every countdown re-snaps to the track's own position. A tolerance of zero here would only ever be satisfied by pretending the measurement was rounder than it was.
  ok('one count is one grid unit, within a millisecond', Math.abs(COUNT - GRID) < 0.001,
    `count ${(COUNT * 1000).toFixed(2)}ms vs grid ${(GRID * 1000).toFixed(2)}ms`)
  console.log(`        worst case wait ${(worstWait * 1000).toFixed(0)}ms, grid ${(GRID * 1000).toFixed(0)}ms`)
}

// The number on screen

console.log('\nthe read means what it says')
{
  // The gates run on normalised confidence, where zero is chance. The screen shows odds, where chance is 25%. Getting this backwards is what put "5% it calls your next turn" on a live screen while the model was doing exactly as well as a coin.
  ok('no idea reads as chance', Math.abs(asOdds(0) - 0.25) < 1e-9, String(asOdds(0)))
  ok('certain reads as certain', Math.abs(asOdds(1) - 1) < 1e-9, String(asOdds(1)))
  ok('it never shows worse than chance', asOdds(0) >= 0.25)
  ok('it is monotonic', asOdds(0.3) < asOdds(0.6) && asOdds(0.6) < asOdds(0.9))
  const target = asOdds(DEFAULT_RUN.clearAt)
  const caught = asOdds(DEFAULT_RUN.readAt)
  ok('the comeback target is above chance', target > 0.25, `${Math.round(target * 100)}%`)
  ok('being caught is worse than the target', caught > target,
    `caught ${Math.round(caught * 100)}% vs target ${Math.round(target * 100)}%`)
  console.log(`        chance 25%   target ${Math.round(target * 100)}%   caught at ${Math.round(caught * 100)}%`)
}

// A returning player

console.log('\na second visit')
{
  const returning = new Run(true)
  ok('skips the warm stage', returning.stage === 'read', returning.stage)
  ok('is steering from the first exchange', returning.steering)
}

// The sentences

console.log('\nwhat it says')
{
  ok('says nothing about four points', readTell(['left', 'right', 'up', 'down'], [false, false, false, false]) === null)

  const never: Direction[] = []
  for (let i = 0; i < 24; i++) never.push(DIRECTIONS_ORDER[i % 4]!)
  const t = readTell(never, never.map(() => false))
  ok('names a perfect cycle', t !== null)
  ok('no placeholders in the sentence', !/undefined|NaN|\[object/.test(t?.text ?? 'x'))
  console.log(`        ${t?.text}`)

  const allLeft: Direction[] = Array.from({ length: 16 }, () => 'left')
  const t2 = readTell(allLeft, allLeft.map(() => false))
  ok('names a single direction', (t2?.text ?? '').includes('left'), t2?.text ?? '')
  console.log(`        ${t2?.text}`)
}

console.log(failures === 0 ? '\nall checks passed\n' : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
