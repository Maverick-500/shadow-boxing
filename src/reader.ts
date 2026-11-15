import type { Reading } from './detector'

// Calls which way a head snapped, as early as it is safe to.
//
// Every number here is measured. Reasoning about the coordinate system gave a classifier that scored 15% where guessing scores 25%.
//
// 2026-10-03, 16 cued turns: left +54.3 yaw, right -59.4, up -40.9 pitch, down +31.5. By commit angle: 69% correct at 2deg, 94% at 3, 100% from 4. Tracking also drops ~17% of frames at full rotation speed, and a call at 4deg is locked in before that.

export type Direction = 'left' | 'right' | 'up' | 'down'

export type ReaderOptions = {
  /** Degrees of deviation from rest at which the call is made. */
  commitDeg: number
  /** Angular speed marking the start of a real turn, in degrees per second. */
  onsetDegPerSec: number
  // Without this a settled turn leaves the gate open and a later drift re-fires.
  onsetWindowMs: number
  // At 1.0, a 4.1deg yaw against a 3.9deg pitch decides the round. Coin flip.
  dominanceRatio: number
}

export const DEFAULT_READER: ReaderOptions = {
  commitDeg: 4,
  onsetDegPerSec: 45,
  onsetWindowMs: 500,
  dominanceRatio: 1.6,
}

/** Positive yaw was measured as the player's left. Do not flip this by eye. */
const YAW_POSITIVE: Direction = 'left'
const PITCH_POSITIVE: Direction = 'down'
const opposite = (d: Direction): Direction =>
  d === 'left' ? 'right' : d === 'right' ? 'left' : d === 'up' ? 'down' : 'up'

export type Call = {
  direction: Direction
  /** When the turn was first moving fast enough to count as started. */
  onsetAt: number
  /** When the direction became certain. */
  calledAt: number
}

export class TurnReader {
  private baseYaw = 0
  private basePitch = 0
  /** Furthest the head got from centre this round, for judging the return. */
  private peak = 0
  private armed = false
  private onsetAt: number | null = null
  private prev: { t: number; yaw: number; pitch: number } | null = null
  private lastFrame = -1

  constructor(private o: ReaderOptions = DEFAULT_READER) {}

  // Which way the head points from the zero right now, for the on-screen figure; read only, so it cannot affect a call.
  lean(reading: Reading, minDeg = 6): Direction | null {
    if (!reading.present) return null
    const dYaw = reading.yaw - this.baseYaw, dPitch = reading.pitch - this.basePitch
    if (Math.max(Math.abs(dYaw), Math.abs(dPitch)) < minDeg) return null
    return Math.abs(dYaw) >= Math.abs(dPitch)
      ? dYaw > 0 ? YAW_POSITIVE : opposite(YAW_POSITIVE)
      : dPitch > 0 ? PITCH_POSITIVE : opposite(PITCH_POSITIVE)
  }

  // Every round. Nobody sits at zero, so an absolute zero measures posture.
  zero(reading: Reading): void {
    if (!reading.present) return
    this.baseYaw = reading.yaw
    this.basePitch = reading.pitch
    this.armed = true
    this.onsetAt = null
    this.prev = null
    this.peak = 0
  }

  /** Current distance from this round's centre, on the leading axis. */
  deviation(reading: Reading): number {
    return Math.max(
      Math.abs(reading.yaw - this.baseYaw),
      Math.abs(reading.pitch - this.basePitch),
    )
  }

  get peakSeen(): number {
    return this.peak
  }

  // Returns a call on the frame the direction is certain, else null. Repeated readings are ignored: half of all reads are the previous answer handed back.
  feed(reading: Reading, now: number): Call | null {
    if (!reading.present) return null
    if (reading.frameId === this.lastFrame) return null
    this.lastFrame = reading.frameId

    // Tracked even after the call, because the head keeps travelling. Freezing the peak at the commit angle would set the return target at a little over one degree, which is the absolute-threshold bug wearing a fraction.
    if (!this.armed) {
      this.peak = Math.max(
        this.peak,
        Math.abs(reading.yaw - this.baseYaw),
        Math.abs(reading.pitch - this.basePitch),
      )
      return null
    }

    const dYaw = reading.yaw - this.baseYaw
    const dPitch = reading.pitch - this.basePitch
    this.peak = Math.max(this.peak, Math.abs(dYaw), Math.abs(dPitch))

    if (this.prev) {
      const dt = (now - this.prev.t) / 1000
      if (dt > 0) {
        const speed = Math.max(
          Math.abs(reading.yaw - this.prev.yaw),
          Math.abs(reading.pitch - this.prev.pitch),
        ) / dt
        // The sample before the fast one: the turn began during the gap, not at the moment it first became visible.
        if (this.onsetAt === null && speed >= this.o.onsetDegPerSec) this.onsetAt = this.prev.t
      }
    }
    this.prev = { t: now, yaw: reading.yaw, pitch: reading.pitch }

    if (Math.max(Math.abs(dYaw), Math.abs(dPitch)) < this.o.commitDeg) return null

    // Fast, not merely far. This gate was computed and then not used, which is why left and right false-called: resting yaw wanders a few degrees as someone shifts, so a slow drift crossed 4deg and read as a snap.
    if (this.onsetAt === null || now - this.onsetAt > this.o.onsetWindowMs) return null

    // Clearly ahead, but not forever. A 45deg turn keeps both axes neck and neck, so past this angle take the lead one regardless: a late call beats timing out and telling the player they did not move.
    const lead = Math.max(Math.abs(dYaw), Math.abs(dPitch))
    const trail = Math.min(Math.abs(dYaw), Math.abs(dPitch))
    const forced = lead >= this.o.commitDeg * 3
    if (!forced && trail > 0 && lead < trail * this.o.dominanceRatio) return null

    this.armed = false
    const direction =
      Math.abs(dYaw) >= Math.abs(dPitch)
        ? dYaw > 0 ? YAW_POSITIVE : opposite(YAW_POSITIVE)
        : dPitch > 0 ? PITCH_POSITIVE : opposite(PITCH_POSITIVE)

    return { direction, onsetAt: this.onsetAt ?? now, calledAt: now }
  }
}
