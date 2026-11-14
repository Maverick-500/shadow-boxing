import type { Mode } from './game'
import type { Run } from './run'

// The words on the overlay, kept out of the frame loop deliberately.
export const pc = (x: number): string => `${Math.round(x * 100)}%`

// The read, as the thing the words on screen actually claim. On screen it read "5% it calls your next turn" while the model was doing exactly as well as a coin, which makes the machine look broken and the sentence look like a lie.
export const asOdds = (read: number): number => 0.25 + read * 0.75

// The start screen, which is also the handover screen.
export function menuFor(remembered: number): string {
  return (
    '<div class="row">' +
    '<button id="go">play</button>' +
    '</div>' +
    // The one thing nothing else on screen tells them. Everything that used to be here explained a mechanic they feel in a single exchange, and explained it to somebody standing up with a queue behind them.
    '<div class="blurb">when it says <b>HOI</b>, turn your head. ' +
    'left, right, up or down.</div>' +
    (remembered > 0
      ? '<div class="handover">' +
        `<button id="fresh" class="quiet">new player</button>` +
        `<span>clears the ${remembered} turns it remembers</span>` +
        '</div>'
      : '') +
    '<div class="note">esc returns here · m mutes</div>' +
    // Credit, not decoration. Newgrounds tracks are licensed per submission and the common terms require attribution, so this is on the screen rather than buried in a readme nobody opens.
    '<div class="credit">music: <b>Stereo Madness</b> by ForeverBound</div>'
  )
}

// The second line of the readout: what the scoreboard is in this mode.
export function tallyLine(
  mode: Mode,
  played: number,
  won: number,
  streak: number,
  fastestMs: number | null,
): string {
  if (mode === 'impossible') {
    const fastest = fastestMs === null ? '' : ` · fastest read ${fastestMs}ms`
    return `${played} ${played === 1 ? 'turn' : 'turns'}${fastest}`
  }
  const rate = played > 0 ? ` (${Math.round((won / played) * 100)}%)` : ''
  // An explicit separator rather than runs of spaces: the readout is no longer a `white-space: pre` block, so collapsed spacing silently ran these together. The screenshot caught it; reasoning about it would not have.
  return `won ${won}/${played}${rate} · chance 25% · streak ${streak}`
}

export type ReadLine = { arc: string; value: string; unit: string; hot: boolean }

// The arc, as the one number a spectator three metres away can read.
export function readLine(run: Run, mode: Mode): ReadLine {
  const t = run.tuning
  const noun = mode === 'impossible' ? 'turn' : 'point'
  switch (run.stage) {
    case 'warm':
      return {
        arc: 'watching you', value: String(run.warmLeft),
        unit: 'more before it uses this', hot: false,
      }
    case 'read':
    case 'reveal':
      return {
        arc: mode === 'impossible' ? 'can it call you' : 'reading you',
        value: pc(asOdds(run.read)),
        unit: `it would guess your next ${noun} · chance is 25%`,
        hot: run.read >= t.readAt,
      }
    case 'comeback':
      return {
        arc: 'bounce back',
        value: pc(asOdds(run.recentRead)),
        unit: `get under ${pc(asOdds(t.clearAt))} · ` +
          `${t.comebackDeadline - run.comebackLength} ${noun}s left`,
        hot: run.recentRead > t.clearAt,
      }
    case 'done':
      return {
        arc: 'run over', value: pc(asOdds(run.peak)),
        unit: 'its best read on you · chance is 25%', hot: false,
      }
  }
}

// What the overlay shows, or an empty string for nothing.
export function panelFor(run: Run, mode: Mode): string {
  const t = run.tuning
  // Impossible mode has the same arc and a different contest.
  const reading = mode === 'impossible'
  const noun = reading ? 'turn' : 'point'

  if (run.stage === 'reveal' && run.caughtBy) {
    const target = reading
      ? `It wins either way: it points where you point. What it should not be able ` +
        `to do is call you before you move, and it is getting that right ` +
        `${pc(asOdds(run.readWhenCaught))} of the time. Get it under ${pc(asOdds(t.clearAt))} and ` +
        `hold it there for ${t.clearHold} turns.`
      : `It is calling your next point right ${pc(run.readWhenCaught)} of the time. ` +
        `Get it under ${pc(t.clearAt)} and hold it there for ${t.clearHold} points.`
    return (
      '<div class="eyebrow">it has you</div>' +
      `<div class="tell">${run.caughtBy.text}</div>` +
      `<div class="counter">${run.caughtBy.counter}</div>` +
      `<div class="target">${target}</div>` +
      '<button>bounce back</button>'
    )
  }

  if (run.stage !== 'done') return ''
  const score = reading
    ? '<div class="target">It matched every turn you made. That half is not winnable ' +
      'and was never meant to be.</div>'
    : `<div class="target">You won ${run.wins} of ${run.played}. ` +
      'Matching it by luck alone is one in four.</div>'

  if (run.ending === 'bounced') {
    return (
      '<div class="eyebrow good">you bounced back</div>' +
      `<div class="tell">It had you at ${pc(asOdds(run.peak))}. You got it down to ` +
      `${pc(asOdds(run.recentRead))} in ${run.comebackLength} ${noun}s.</div>` +
      `<div class="counter">The habit you broke: ${run.caughtBy?.text ?? ''}</div>` +
      score + '<button>again</button>'
    )
  }
  if (run.ending === 'never-read') {
    return (
      '<div class="eyebrow good">it never got you</div>' +
      // The peak and the absence of a habit are both true and look like they contradict each other, so the sentence has to say which is which: it can be ahead of you without being able to explain why.
      `<div class="tell">${run.played} ${noun}s, and it never found a habit it could ` +
      `put into words. The closest it came was a ${pc(asOdds(run.peak))} read on your next ${noun}.</div>` +
      '<div class="counter">That is the rarer ending. Almost nobody is actually unpredictable.</div>' +
      score + '<button>again</button>'
    )
  }
  return (
    '<div class="eyebrow">it still has you</div>' +
    `<div class="tell">${run.comebackLength} ${noun}s to shake it, and it is still ` +
    `calling you ${pc(asOdds(run.recentRead))} of the time.</div>` +
    `<div class="counter">${run.caughtBy?.counter ?? ''}</div>` +
    score + '<button>try again</button>'
  )
}
