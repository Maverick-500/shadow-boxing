import type { Direction } from './reader'
import { monsterName } from './monster'

// The endless fight. Each monster commits to a direction at the beat; if you turn somewhere else you dodge and hit it, if it called you it hits you.

export const PLAYER_HP = 100
export const PLAYER_HIT = 20

// How often the monster strikes from the model rather than blind. Climbs every fight and stops just short of certain, so it never quite becomes impossible mode.
export function weightFor(level: number): number {
  return Math.min(0.95, 0.15 + 0.12 * (level - 1))
}

export function monsterHpFor(level: number): number {
  return 40 + 20 * level
}

export function monsterDamageFor(level: number): number {
  return 10 + 3 * level
}

export type Monster = {
  level: number
  seed: number
  name: string
  maxHp: number
  hp: number
  weight: number
  damage: number
}

export type Blow = 'hit' | 'struck' | 'cleared' | 'dead'

export function spawn(level: number, runSeed: number): Monster {
  const seed = (runSeed * 2654435761 + level * 40503) >>> 0
  const maxHp = monsterHpFor(level)
  return {
    level, seed, name: monsterName(seed, level), maxHp, hp: maxHp,
    weight: weightFor(level), damage: monsterDamageFor(level),
  }
}

export class Rpg {
  hp = PLAYER_HP
  readonly maxHp = PLAYER_HP
  level = 1
  defeated = 0
  state: 'fight' | 'cleared' | 'dead' = 'fight'
  monster: Monster
  // Whether the last strike came from the model or was blind, for the diagnostics line.
  lastStrikeFromModel = false

  constructor(private readonly runSeed: number) {
    this.monster = spawn(1, runSeed)
  }

  // Mixing the model's distribution with uniform noise would not change which direction is on top, so the weight has to pick between the two guesses instead.
  strike(guess: () => Direction, blind: () => Direction, random: () => number = Math.random): Direction {
    this.lastStrikeFromModel = random() < this.monster.weight
    return this.lastStrikeFromModel ? guess() : blind()
  }

  resolve(dodged: boolean): Blow {
    if (this.state !== 'fight') return this.state === 'dead' ? 'dead' : 'cleared'
    if (dodged) {
      this.monster.hp = Math.max(0, this.monster.hp - PLAYER_HIT)
      if (this.monster.hp === 0) {
        this.state = 'cleared'
        this.defeated++
        return 'cleared'
      }
      return 'hit'
    }
    this.hp = Math.max(0, this.hp - this.monster.damage)
    if (this.hp === 0) {
      this.state = 'dead'
      return 'dead'
    }
    return 'struck'
  }

  advance(): void {
    if (this.state !== 'cleared') return
    this.level++
    this.monster = spawn(this.level, this.runSeed)
    this.state = 'fight'
  }
}
