import type { Row } from './board'
import type { Mode } from './game'
import type { Rpg } from './rpg'
import type { Run } from './run'
import type { Tell } from './tell'

// The words on the overlay, kept out of the frame loop deliberately.
export const pc = (x: number): string => `${Math.round(x * 100)}%`

// The read, as the thing the words on screen actually claim. On screen it read "5% it calls your next turn" while the model was doing exactly as well as a coin, which makes the machine look broken and the sentence look like a lie.
export const asOdds = (read: number): number => 0.25 + read * 0.75

// The start screen, which is also the handover screen.
// Initials are validated as A-Z on the server, but anything reaching innerHTML is escaped anyway.
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function boardHtml(rows: Row[], mine: number | null, limit = 10): string {
  if (rows.length === 0) return '<div class="board empty">no scores yet. be the first.</div>'
  return '<ol class="board">' + rows.slice(0, limit).map((r, i) =>
    `<li class="${r.id === mine ? 'mine' : ''}"><span class="rank">${i + 1}</span>` +
    `<span class="ini">${esc(r.initials)}</span><span class="pts">${r.score}</span></li>`,
  ).join('') + '</ol>'
}

export function menuFor(remembered: number, best: number, rows: Row[] = []): string {
  return (
    '<div class="row">' +
    '<button id="go">rpg</button>' +
    '<button id="imp" class="ghost">impossible</button>' +
    '<button id="how" class="quiet">how to play</button>' +
    '</div>' +
    '<div class="modes"><span><b>rpg</b> dodge where it thinks you will go. endless.' +
    (best > 0 ? ` table best ${best}.` : '') + '</span>' +
    '<span><b>impossible</b> it reads your head. you cannot win, only stop being predictable.</span></div>' +
    // The one thing nothing else on screen tells them. Everything that used to be here explained a mechanic they feel in a single exchange, and explained it to somebody standing up with a queue behind them.
    '<div class="blurb">when it says <b>HOI</b>, turn your head. ' +
    'left, right, up or down.</div>' +
    (remembered > 0
      ? '<div class="handover">' +
        `<button id="fresh" class="quiet">new player</button>` +
        `<span>clears the ${remembered} turns it remembers</span>` +
        '</div>'
      : '') +
    (rows.length > 0 ? '<div class="menuboard"><div class="note">top monsters beaten</div>' + boardHtml(rows, null, 5) + '</div>' : '') +
    '<div class="note">esc menu · h help · n new player · m mute</div>' +
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

// The HUD in a fight. The honest number here is how often the monster is striking from your habits rather than guessing blind.
export function rpgLine(rpg: Rpg, best: number): { arc: string; value: string; unit: string; tally: string } {
  return {
    arc: `level ${rpg.level}`,
    value: String(rpg.defeated),
    unit: `down · table best ${Math.max(best, rpg.defeated)}`,
    tally: `it strikes from your habits ${pc(rpg.monster.weight)} of the time`,
  }
}

// The end of an endless run. The tell is the habit that was being used against you, so the next go has something to fix.
export type BoardView = {
  status: 'entry' | 'saving' | 'saved' | 'error'
  rows: Row[]
  mine: number | null
  error: string
  online: boolean
}

export function rpgPanel(rpg: Rpg, best: number, tell: Tell | null, board: BoardView): string {
  if (rpg.state !== 'dead') return ''
  const record = rpg.defeated > 0 && rpg.defeated >= best
  const head =
    `<div class="eyebrow">${esc(rpg.monster.name)} got you</div>` +
    `<div class="tell">${rpg.defeated} ${rpg.defeated === 1 ? 'monster' : 'monsters'} down, level ${rpg.level}.</div>` +
    (record ? '<div class="counter">New table best.</div>' : `<div class="counter">Table best is ${best}.</div>`) +
    (tell
      ? `<div class="target">What it was using: ${tell.text} ${tell.counter}</div>`
      : '<div class="target">It never found one habit it could name. It just got lucky enough.</div>')
  const where = board.online ? 'leaderboard' : 'leaderboard on this machine'
  if (board.status === 'entry') {
    return head +
      `<div class="entry"><label for="ini">your initials for the ${where}</label>` +
      (board.error ? `<div class="target accent">${esc(board.error)}</div>` : '') +
      '<input id="ini" maxlength="3" autocomplete="off" spellcheck="false" placeholder="AAA" />' +
      '<div class="row"><button id="save">save</button><button id="again" class="ghost">skip</button></div></div>'
  }
  if (board.status === 'saving') return head + '<div class="entry"><label>saving</label></div>'
  return head +
    (board.status === 'error' ? `<div class="target accent">${esc(board.error)}</div>` : '') +
    boardHtml(board.rows, board.mine) +
    '<button id="again">again</button>'
}
