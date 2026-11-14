// Countdown tones, scheduled on the audio clock.

// The soundtrack's own tempo, measured rather than remembered. Spectral flux autocorrelation over the whole file put it at 159.05, and a refinement sweep across a two BPM window settled on 160.01 with the first beat 46ms in.
const BPM = 160.01
const TRACK_FIRST_BEAT = 0.046
const TRACK_URL = '/stereo-madness.mp3'
const BEAT = 60 / BPM
const SIXTEENTH = BEAT / 4
// Where the beat is allowed to land: every half bar, which at 4/4 means the HOI falls on beat one or beat three, both strong. Half a bar caps that wait at 750ms.
export const LANDING_GRID = (60 / BPM) * 2

// When the beat should land, given the clock and the grid.
export function landingTime(
  now: number,
  gridFrom: number,
  countSeconds: number,
  grid: number = LANDING_GRID,
): number {
  const earliest = now + 0.12 + countSeconds * 3
  const ahead = earliest - gridFrom
  return gridFrom + Math.ceil(ahead / grid) * grid
}

/** How far ahead the scheduler writes, and how often it wakes up to do it. */
const LOOKAHEAD = 0.14
const TICK_MS = 25

export class Audio {
  private ctx: AudioContext | null = null

  // The music, on its own gain so the game's own tones always sit above it.
  private music: GainNode | null = null
  private track: HTMLAudioElement | null = null
  private trackPlaying = false
  private noise: AudioBuffer | null = null
  private timer: number | null = null
  /** Audio-clock time of the next sixteenth, and where it sits in the bar. */
  private nextNote = 0
  private step = 0
  /** The downbeat the grid is measured from, so the countdown can land on one. */
  private gridFrom = 0
  private muted = false

  resume(): void {
    if (!this.ctx) this.ctx = new AudioContext()
    void this.ctx.resume()
  }

  private tone(at: number, hz: number, seconds: number, peak = 0.14): void {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(hz, at)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + seconds + 0.02)
  }

  // The grid

  /** One noise buffer, reused by every drum that needs it. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.noise = buf
    return buf
  }

  private hit(at: number, hz: number, drop: number, seconds: number, peak: number): void {
    const ctx = this.ctx
    const out = this.music
    if (!ctx || !out) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(hz, at)
    osc.frequency.exponentialRampToValueAtTime(drop, at + seconds)
    gain.gain.setValueAtTime(peak, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + seconds + 0.02)
  }

  private rattle(at: number, hz: number, seconds: number, peak: number): void {
    const ctx = this.ctx
    const out = this.music
    if (!ctx || !out) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = hz
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(peak, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
    src.connect(filter).connect(gain).connect(out)
    src.start(at)
    src.stop(at + seconds + 0.02)
  }

  private bass(at: number, hz: number, seconds: number): void {
    const ctx = this.ctx
    const out = this.music
    if (!ctx || !out) return
    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(hz, at)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, at)
    filter.frequency.exponentialRampToValueAtTime(300, at + seconds)
    gain.gain.setValueAtTime(0.09, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
    osc.connect(filter).connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + seconds + 0.02)
  }

  // One sixteenth of the loop.
  private scheduleStep(step: number, at: number, bar: number): void {
    const sixteenth = step % 16
    if (sixteenth === 0 || sixteenth === 10) this.hit(at, 150, 45, 0.14, 0.5)
    if (sixteenth === 4 || sixteenth === 12) this.rattle(at, 1400, 0.11, 0.22)
    if (sixteenth % 2 === 0) this.rattle(at, 8000, 0.025, 0.07)
    else if (sixteenth % 4 === 3) this.rattle(at, 8000, 0.02, 0.04)
    // A four bar loop, so it does not become a two bar nag over a long queue.
    const roots = [55, 55, 73.42, 65.41]
    const root = roots[bar % roots.length]!
    if (sixteenth === 0 || sixteenth === 6 || sixteenth === 11) {
      this.bass(at, sixteenth === 11 ? root * 1.5 : root, 0.22)
    }
  }

  // Starts the loop, if it is not already running.
  startBeat(): void {
    const ctx = this.ctx
    if (!ctx || this.timer !== null || this.trackPlaying) return
    this.ensureMusicBus(ctx)
    this.nextNote = ctx.currentTime + 0.08
    this.gridFrom = this.nextNote
    this.step = 0
    this.timer = window.setInterval(() => {
      const now = ctx.currentTime
      while (this.nextNote < now + LOOKAHEAD) {
        this.scheduleStep(this.step, this.nextNote, Math.floor(this.step / 16))
        this.nextNote += SIXTEENTH
        this.step++
      }
    }, TICK_MS)
  }

  // The soundtrack, with the synthesised loop behind it.
  startMusic(): void {
    const ctx = this.ctx
    if (!ctx || this.track) return
    this.ensureMusicBus(ctx)
    const el = new window.Audio(TRACK_URL)
    el.loop = true
    el.preload = 'auto'
    el.addEventListener('error', () => {
      this.track = null
      this.trackPlaying = false
      this.startBeat()
    }, { once: true })
    el.addEventListener('canplay', () => {
      const bus = this.music
      if (!bus) return
      try {
        ctx.createMediaElementSource(el).connect(bus)
      } catch {
        // Already wired, which happens if canplay fires twice.
      }
      void el.play().then(() => { this.trackPlaying = true }).catch(() => {
        this.trackPlaying = false
        this.startBeat()
      })
    }, { once: true })
    this.track = el
  }

  private ensureMusicBus(ctx: AudioContext): GainNode {
    if (!this.music) {
      this.music = ctx.createGain()
      this.music.gain.value = this.muted ? 0 : 0.5
      this.music.connect(ctx.destination)
    }
    return this.music
  }

  stopBeat(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  /** Under the overlay, where there is a paragraph to read and no game on. */
  duck(on: boolean): void {
    const ctx = this.ctx
    if (!ctx || !this.music) return
    const to = this.muted ? 0 : on ? 0.12 : 0.5
    this.music.gain.cancelScheduledValues(ctx.currentTime)
    this.music.gain.setTargetAtTime(to, ctx.currentTime, 0.08)
  }

  /** For when the room is too loud, or not loud enough for a stranger's taste. */
  toggleMute(): boolean {
    this.muted = !this.muted
    this.duck(false)
    return this.muted
  }

  // Schedules three counts and the beat, landing the beat on a downbeat.
  scheduleCountdown(countMs: number): number {
    const ctx = this.ctx
    if (!ctx) return performance.now() + countMs * 3
    const step = countMs / 1000
    let start = ctx.currentTime + 0.12
    const landing = this.nextLanding(ctx.currentTime, step)
    if (landing !== null) start = landing - step * 3
    this.tone(start, 520, 0.1)
    this.tone(start + step, 520, 0.1)
    this.tone(start + step * 2, 520, 0.1)
    // The beat is higher and longer, so it cannot be mistaken for a count.
    this.tone(start + step * 3, 880, 0.3, 0.2)
    const offsetMs = performance.now() - ctx.currentTime * 1000
    return (start + step * 3) * 1000 + offsetMs
  }

  // The next slot on whichever grid is actually playing.
  private nextLanding(now: number, step: number): number | null {
    const el = this.track
    if (el && this.trackPlaying && !el.paused) {
      const inTrack = el.currentTime - TRACK_FIRST_BEAT
      const earliest = inTrack + 0.12 + step * 3
      const snapped = Math.ceil(earliest / LANDING_GRID) * LANDING_GRID
      return now + (snapped - inTrack)
    }
    if (this.timer !== null) return landingTime(now, this.gridFrom, step)
    return null
  }

  // The commit blip.
  jump(): void {
    const ctx = this.ctx
    if (!ctx) return
    const at = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(300, at)
    osc.frequency.exponentialRampToValueAtTime(900, at + 0.07)
    gain.gain.setValueAtTime(0.12, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + 0.12)
  }

  caught(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.tone(t, 180, 0.34, 0.2)
    this.tone(t + 0.02, 120, 0.4, 0.16)
  }

  survived(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.tone(t, 760, 0.12)
    this.tone(t + 0.1, 1140, 0.22)
  }

  // It has worked you out and is about to say how.
  revealed(): void {
    const ctx = this.ctx
    if (!ctx) return
    // Behind the sting for the exchange that happened to trigger it, so the two do not land on the same instant and turn into one muddy noise.
    const t = ctx.currentTime + 0.4
    this.tone(t, 300, 0.24, 0.17)
    this.tone(t + 0.17, 300, 0.42, 0.13)
  }

  /** Out from under it. The only rising triad in the game, used once a run. */
  bounced(): void {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + 0.4
    this.tone(t, 520, 0.16)
    this.tone(t + 0.13, 780, 0.16)
    this.tone(t + 0.26, 1040, 0.5, 0.2)
  }
}
