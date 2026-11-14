import { Audio } from './audio'
import { Detector, type Reading } from './detector'
import { COUNT_MS, DIRECTIONS_ORDER, Game, type Mode, type Role } from './game'
import { Predictor, type Prior } from './predictor'
import { DEFAULT_READER, TurnReader, type Direction } from './reader'
import { mark } from './marks'
import { menuFor, panelFor, readLine, tallyLine } from './panel'
import { Run } from './run'

const video = document.getElementById('cam') as HTMLVideoElement
const handEl = document.getElementById('hand')!
const callEl = document.getElementById('call')!
const roleEl = document.getElementById('role')!
const arcEl = document.getElementById('arc')!
const readEl = document.getElementById('read')!
const tallyEl = document.getElementById('tally')!
const diagEl = document.getElementById('diag')!
const msg = document.getElementById('msg')!
const panelEl = document.getElementById('panel')!

const detector = new Detector()
const reader = new TurnReader(DEFAULT_READER)
const audio = new Audio()
const predictor = new Predictor()

// The only game now.
const MODE: Mode = 'impossible'

/** Uniform, for the warm stage, where it is watching but not yet using it. */
const uniform = (): Direction =>
  DIRECTIONS_ORDER[Math.floor(Math.random() * DIRECTIONS_ORDER.length)]!

// The arc of one session, replaced on every run, which is why it is not const.
let run = new Run()

const game = new Game(() => (run.steering ? predictor.choose() : uniform()))

// The predictor remembers between visits.
const MEMORY_KEY = 'hoi.predictor.v1'
const PLAYER_KEY = 'hoi.player.v1'
const VISITS_KEY = 'hoi.visits.v1'

const store = {
  get(k: string): string | null {
    try { return localStorage.getItem(k) } catch { return null }
  },
  set(k: string, v: string): void {
    try { localStorage.setItem(k, v) } catch { /* private window, blocked storage */ }
  },
  clear(k: string): void {
    try { localStorage.removeItem(k) } catch { /* same answer as set */ }
  },
}

const saved = store.get(MEMORY_KEY)
if (saved) predictor.load(saved)

// A random id with nothing attached to it.
function knownPlayer(): string {
  const existing = store.get(PLAYER_KEY)
  if (existing) return existing
  const minted = crypto.randomUUID()
  store.set(PLAYER_KEY, minted)
  return minted
}

// All three are reassigned by the handover to the next person at the table, which is the only reason they are not const.
let playerId = knownPlayer()
let sessionId = crypto.randomUUID()
let priorVisits = Number(store.get(VISITS_KEY) ?? '0') || 0
store.set(VISITS_KEY, String(priorVisits + 1))

// Switches itself off when the prior fails. On a static host like itch those endpoints do not exist, and every exchange would 404 into the console.
let pooling = true

// Pooled counts, behind a short timeout. Nothing in a round waits on this.
void (async () => {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const res = await fetch('/api/prior', { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      pooling = false
      return
    }
    const prior = (await res.json()) as Prior
    if (prior && typeof prior.total === 'number') predictor.usePrior(prior)
  } catch {
    // Offline, blocked, slow or broken. All the same answer: play anyway.
    pooling = false
  }
})()

/** Posts one exchange and forgets about it. Nothing in a round waits on this. */
function report(chose: Direction, machine: Direction | null, won: boolean, round: number): void {
  if (!pooling) return
  const h = recentChoices
  void fetch('/api/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      player: playerId,
      session: sessionId,
      round,
      priorVisits,
      chose,
      machine,
      won,
      prev1: h[h.length - 1] ?? null,
      prev2: h[h.length - 2] ?? null,
      prevWon: lastWon,
    }),
    keepalive: true,
  }).catch(() => { /* fire and forget, on purpose */ })
}

/** The player's own recent choices, kept so each post carries its context. */
const recentChoices: Direction[] = []
let lastWon: boolean | null = null

function showMark(dir: Direction, kind: 'hand' | 'face'): void {
  const m = mark(dir, kind)
  handEl.innerHTML = m.html
  handEl.className = m.className
}

// Boot

let lastMsgHtml = ''
function setMsg(html: string, wire?: () => void): void {
  if (html === lastMsgHtml) return
  lastMsgHtml = html
  msg.innerHTML = html
  wire?.()
}

// The overlay, for the two moments the game stops to say something.
let lastDucked = false
let lastPanel = ''
function setPanel(html: string): void {
  if (html === lastPanel) return
  lastPanel = html
  if (html === '') {
    panelEl.classList.remove('show')
    panelEl.innerHTML = ''
    return
  }
  panelEl.innerHTML = `<div>${html}</div>`
  panelEl.classList.add('show')
  panelEl.querySelector('button')?.addEventListener('click', dismissPanel, { once: true })
}

function dismissPanel(): void {
  if (run.stage === 'reveal') {
    run.acknowledge()
    game.next()
    return
  }
  // Back into the mode they were already playing. Sending somebody who chose impossible into the guessing game because the button said "again" is a silent mode switch, and they would spend the next six exchanges wondering why it had stopped reading them.
  if (run.stage === 'done') startRun(MODE)
}

// Hands the game to the next person in the queue.
function newPlayer(): void {
  predictor.reset()
  store.clear(MEMORY_KEY)
  playerId = crypto.randomUUID()
  store.set(PLAYER_KEY, playerId)
  sessionId = crypto.randomUUID()
  priorVisits = 0
  store.set(VISITS_KEY, '1')
  game.best = 0
  game.bestStreak = 0
  recentChoices.length = 0
  lastWon = null
  run = new Run()
  game.stop()
  setPanel('')
  showMenu()
}

// Somebody mid-run has their hands nowhere near the trackpad, and at a booth the next person wants to start without being handed a mouse.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && game.phase !== 'idle') {
    game.stop()
    setPanel('')
    showMenu()
    return
  }
  // The instrument values, for when it is me looking at it rather than a player. Off by default because across a room they competed with the one number that matters.
  if (event.key === 'm' || event.key === 'M') {
    audio.toggleMute()
    return
  }
  if (event.key === 'd' || event.key === 'D') {
    document.body.classList.toggle('diag')
    return
  }
  // The handover, for an operator whose hands are on the keyboard and whose eyes are on the queue. Gated on the menu so it cannot be hit mid-run.
  if ((event.key === 'n' || event.key === 'N') && game.phase === 'idle') {
    newPlayer()
    return
  }
  if (event.key !== ' ' && event.key !== 'Enter') return
  if (!panelEl.classList.contains('show')) return
  event.preventDefault()
  dismissPanel()
})


// The start screen, which is also the handover screen.
function showMenu(): void {
  setMsg(menuFor(predictor.seen), () => {
    document.getElementById('go')?.addEventListener('click', () => startRun(MODE))
    document.getElementById('fresh')?.addEventListener('click', newPlayer)
  })
}

function startRun(mode: Mode): void {
  audio.resume()
  // Left running once it starts, including back on the menu. A booth with a pulse reads as running rather than waiting, and silence between players is what makes a queue drift off.
  audio.startMusic()
  // Skip the warm stage for a returning player (it is already using their loaded history) and in impossible mode (nothing to warm up for).
  run = new Run(mode === 'impossible' || predictor.seen > 0)
  game.start(mode)
  setPanel('')
  phaseStartedAt = performance.now()
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not respond within ${ms / 1000}s`)), ms),
    ),
  ])
}

function fail(stage: string, err: unknown): void {
  const e = err as { name?: string; message?: string }
  const reason =
    e?.name === 'NotAllowedError'
      ? 'Camera permission was refused. Allow it in the address bar, then retry.'
      : e?.name === 'NotReadableError'
        ? 'Another tab or app is using the camera. Close it, then retry.'
        : e?.name === 'NotFoundError'
          ? 'No camera found.'
          : e?.message || String(err)
  setMsg(
    `<div class="big accent">${stage} failed</div>` +
      `<div class="blurb">${reason}</div>` +
      `<div class="row" style="margin-top:16px"><button id="retry">retry</button></div>`,
    () => {
      document.getElementById('retry')?.addEventListener('click', () => { void boot() }, { once: true })
    },
  )
}

async function boot(): Promise<void> {
  setMsg('<button disabled>loading</button>')
  try {
    await withTimeout(detector.load(), 20000, 'Face model')
  } catch (err) {
    fail('Loading the face model', err)
    return
  }

  // The timeout has to know whether a permission prompt is open. getUserMedia does not settle while the browser waits for a decision, so a fixed limit is really a limit on how fast somebody clicks Allow.
  const state = await navigator.permissions
    .query({ name: 'camera' as PermissionName })
    .then((p) => p.state)
    .catch(() => 'prompt' as PermissionState)
  if (state === 'denied') {
    fail('Starting the camera', { name: 'NotAllowedError' })
    return
  }
  const waiting = state === 'prompt'
  if (waiting) {
    setMsg(
      '<div class="big">allow the camera</div>' +
        '<div class="blurb">Your browser is asking. Nothing leaves this page: ' +
        'no video is recorded, stored or sent.</div>',
    )
  }
  try {
    video.srcObject = await withTimeout(
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } }),
      waiting ? 120000 : 15000,
      'Camera',
    )
    await video.play()
  } catch (err) {
    fail('Starting the camera', err)
    return
  }
  showMenu()
}

// Loop

let phaseStartedAt = 0
let lastPhase = ''
let lastStage = ''
let beatAt = 0
let preBeat: { yaw: number; pitch: number } | null = null
/** Degrees of head movement during the count that counts as jumping the gun. */
const FALSE_START_DEG = 9

const ROLE_BRIEF: Record<Role, string> = {
  'player-turns': 'turn your head. it will point where you went.',
  'player-points': 'it has already chosen. point your head and match it.',
}

function frame(): void {
  requestAnimationFrame(frame)
  const now = performance.now()
  const reading: Reading = detector.read(video)

  if (game.phase !== lastPhase) {
    const entering = game.phase
    lastPhase = entering
    phaseStartedAt = now
    if (entering === 'countdown') preBeat = null
    if (entering === 'reveal') {
      const e = game.last
      if (e?.outcome === 'won') audio.survived()
      else if (e?.outcome !== 'falseStart') audio.caught()
    }
  }

  // The run has its own two moments, and they are not the same event as an exchange being won or lost.
  if (run.stage !== lastStage) {
    const entering = run.stage
    lastStage = entering
    if (entering === 'reveal') audio.revealed()
    else if (entering === 'done') {
      if (run.ending === 'bounced') audio.bounced()
      else audio.revealed()
    }
  }
  const inPhase = now - phaseStartedAt

  switch (game.phase) {
    case 'idle':
      handEl.classList.remove('show')
      callEl.classList.remove('show')
      break

    case 'centre': {
      handEl.classList.remove('show')
      callEl.classList.remove('show')
      reader.zero(reading)
      if (reading.present && inPhase > 350) {
        game.beginCountdown()
        beatAt = audio.scheduleCountdown(COUNT_MS)
      }
      break
    }

    case 'countdown': {
      handEl.classList.remove('show')
      const remaining = beatAt - now
      // Only once the three counts have actually started. Quantising the beat to the music can hold the countdown back by up to one grid unit, and a digit derived from the time left would have counted down from seven through that wait.
      const counting = remaining <= COUNT_MS * 3 + 80
      if (counting) callEl.textContent = String(Math.max(1, Math.ceil(remaining / COUNT_MS)))
      callEl.classList.toggle('show', counting)
      reader.zero(reading)

      // Checked on raw deviation rather than through the reader, which is being re-zeroed every frame and so can never see a pre-beat turn.
      if (reading.present) {
        if (preBeat === null) preBeat = { yaw: reading.yaw, pitch: reading.pitch }
        const moved = Math.max(
          Math.abs(reading.yaw - preBeat.yaw),
          Math.abs(reading.pitch - preBeat.pitch),
        )
        if (moved > FALSE_START_DEG) game.falseStart()
      }

      if (now >= beatAt) {
        game.beginRound(now)
        reader.zero(reading)
      }
      break
    }

    case 'live': {
      callEl.textContent = 'HOI'
      callEl.classList.toggle('show', inPhase < 380)

      const call = reader.feed(reading, now)
      if (call) {
        audio.jump()
        game.commit(call.direction, call.onsetAt, call.calledAt)
        // Recorded after the exchange resolves, never before: the machine's choice was locked at the beat and must not be influenced by this.
        const e0 = game.last
        if (e0) {
          const won = e0.outcome === 'won'
          // Pooled from the guessing game only. In impossible mode the result is fixed by the rules rather than by anything the player did, so posting it would teach the shared model that everybody loses after everything, which is true there and false everywhere else.
          if (game.mode === 'normal') report(call.direction, e0.machine, won, recentChoices.length)
          predictor.observe(call.direction, won)
          // Fed the confidence *after* this choice was folded in, so the number the run is judged on is a statement about the next exchange rather than the one just played.
          run.observe(call.direction, won, predictor.confidence)
          store.set(MEMORY_KEY, predictor.save())
          recentChoices.push(call.direction)
          if (recentChoices.length > 8) recentChoices.shift()
          lastWon = won
        }
        const e = game.last
        if (e?.machine) {
          // When the machine points, show a finger. When it turned its own head, show where it looked. Same slot, different claim.
          showMark(e.machine, game.role === 'player-turns' ? 'hand' : 'face')
        }
      } else if (game.expired(now)) {
        game.timeout()
      }
      break
    }

    case 'reveal': {
      // The run holds the game here when it has something to say. Without this the reveal screen would appear and then be cleared a second and a half later by the next exchange starting underneath it.
      if (run.holding) break
      if (inPhase > 900) game.next()
      break
    }

    case 'over':
      break
  }

  // Readout

  // The role label used to say "it reads you" in the opposite corner to a readout already saying "can it call you". With one mode left, that is the same sentence twice in two corners, so the corner is empty now.
  roleEl.textContent = ''

  // Idle is checked here rather than inside `panelFor`, because the overlay is a thing that happens during a run: without this, pressing Escape on a finished run puts the end card straight back over the menu.
  const panel = game.phase === 'idle' ? '' : panelFor(run, game.mode)
  setPanel(panel)
  const ducked = panel !== ''
  if (ducked !== lastDucked) {
    lastDucked = ducked
    audio.duck(ducked)
  }

  const e = game.last
  if (panel !== '') {
    // The overlay is saying the important thing. Two messages at once is how a screen stops being readable in ninety seconds.
    setMsg('')
  } else if (game.phase === 'reveal' && e) {
    const line =
      e.outcome === 'won'
        ? '<span class="big">you win that one</span>'
        : e.outcome === 'falseStart'
          ? '<span class="big accent">too early</span>'
          : e.outcome === 'noInput'
            ? '<span class="big accent">you did not move</span>'
            : e.role === 'player-turns'
              ? '<span class="big accent">it read you</span>'
              : '<span class="big accent">missed</span>'
    const detail =
      e.role === 'player-points' && e.machine && e.player
        ? `<div style="color:var(--dim);margin-top:6px">it looked ${e.machine}, you pointed ${e.player}</div>`
        : ''
    setMsg(line + detail)
  } else if (game.phase !== 'idle' && game.phase !== 'over') {
    setMsg(`<div style="color:var(--dim)">${ROLE_BRIEF[game.role]}</div>`)
  }

  paintReadout(reading)
}

// Writes only what changed.
const painted: Record<string, string> = {}

// The tally and the fastest read, recomputed only when an exchange lands. Both walk the whole history, and the readout is painted inside a 60fps loop that is already sharing a core with a face model.
let countedAt = -1
let cachedTally = { pointsPlayed: 0, pointsWon: 0, turnsPlayed: 0, turnsWon: 0 }
let cachedFastest: number | null = null
function paint(el: Element, key: string, html: string): void {
  if (painted[key] === html) return
  painted[key] = html
  el.innerHTML = html
}

/** The fastest read of the run, which is the number the whole flex rests on. */
function fastestRead(): number | null {
  let best = Infinity
  for (const h of game.history) if (h.readMs !== null) best = Math.min(best, h.readMs)
  return best === Infinity ? null : best
}

function paintReadout(reading: Reading): void {
  const idle = game.phase === 'idle'
  // Losing the face stops everything working, and it is the one fault a player can actually fix, so it shows itself rather than waiting to be asked for.
  document.body.classList.toggle('lost', !idle && !reading.present)

  if (idle) {
    paint(arcEl, 'arc', '')
    paint(readEl, 'read', '')
    paint(tallyEl, 'tally', '')
    paint(diagEl, 'diag', '')
    readEl.classList.remove('hot')
    return
  }

  const impossible = game.mode === 'impossible'
  const line = readLine(run, game.mode)
  paint(arcEl, 'arc', line.arc)
  paint(readEl, 'read', `${line.value}<span class="unit"> ${line.unit}</span>`)
  readEl.classList.toggle('hot', line.hot)

  if (game.history.length !== countedAt) {
    countedAt = game.history.length
    cachedTally = game.tally
    cachedFastest = fastestRead()
  }
  const played = impossible ? cachedTally.turnsPlayed : cachedTally.pointsPlayed
  const won = impossible ? cachedTally.turnsWon : cachedTally.pointsWon
  paint(tallyEl, 'tally', tallyLine(game.mode, played, won, game.streak, cachedFastest))

  const showing = document.body.classList.contains('diag') || !reading.present
  if (!showing) return
  const away = reading.present ? reader.deviation(reading) : 0
  paint(diagEl, 'diag', reading.present
    ? `tracked · ${reading.latencyMs.toFixed(0)}ms · turn ${away.toFixed(0)}deg · ` +
      `${game.voided} void · ${predictor.seen} yours · ${predictor.pooled} pooled`
    : 'FACE LOST. move back into frame')
}

requestAnimationFrame(frame)
void boot()

Object.assign(window, { __hoi: { game, reader, detector, boot } })
