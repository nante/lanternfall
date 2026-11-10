import { WINDUP, HOLD, STRIKE, RECOVER } from './figures/poses.ts';

/**
 * Weight without lies (decision 14). The wind-up starts 180 ms before the server's `attackAt`; the strike frame is
 * drawn only after the server's hit, miss or block effect arrives; with no effect 250 ms past the expected moment the
 * figure relaxes. Hit-stop pauses animation clocks only. Knockback and kick are drawn offsets, never positions.
 */
export const WINDUP_MS = 180, RELAX_MS = 250;

export type FeelLevel = 'off' | 'subtle' | 'heavy';
export type Tuning = { hitStop: number; knock: number; kickHit: number; kickBig: number; flash: boolean; dust: boolean; collapse: boolean };
export const feelLevels: Record<FeelLevel, Tuning> = {
  off: { hitStop: 0, knock: 0, kickHit: 0, kickBig: 0, flash: false, dust: false, collapse: false },
  subtle: { hitStop: 40, knock: 0.06, kickHit: 1, kickBig: 2, flash: true, dust: true, collapse: true },
  heavy: { hitStop: 70, knock: 0.12, kickHit: 2, kickBig: 3, flash: true, dust: true, collapse: true },
};
export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Reduced motion keeps the honest timing and the outcome frames, and drops kick, hit-stop, flashes, knockback, dust and the collapse puff. */
export const tuning = (level: FeelLevel, reduced: boolean): Tuning =>
  reduced ? { ...feelLevels[level], hitStop: 0, knock: 0, kickHit: 0, kickBig: 0, flash: false, dust: false, collapse: false } : feelLevels[level];

/** One actor's attack beat. `since` is on the actor's animation clock (ms); `expect` and `attackAt` are server ms. */
export type Swing =
  | { phase: 'rest' }
  | { phase: 'windup'; since: number; expect: number }
  | { phase: 'strike'; since: number; effectAt: number; effect: number }
  | { phase: 'recover'; since: number; relaxed: boolean };

const STRIKE_HOLD = 130, STRIKE_END = 320, RECOVER_END = 150, HOLD_AFTER = 90;

/** Advance the beat. `engaged` means the attacker has a target on an adjacent server tile. */
export function stepSwing(s: Swing, engaged: boolean, attackAt: number, serverNow: number, clock: number): Swing {
  switch (s.phase) {
    case 'rest':
      return engaged && serverNow >= attackAt - WINDUP_MS ? { phase: 'windup', since: clock, expect: Math.max(attackAt, serverNow) } : s;
    case 'windup':
      return !engaged || serverNow > s.expect + RELAX_MS ? { phase: 'recover', since: clock, relaxed: true } : s;
    case 'strike':
      return clock - s.since >= STRIKE_END ? { phase: 'rest' } : s;
    case 'recover':
      return clock - s.since >= RECOVER_END ? { phase: 'rest' } : s;
  }
}
/** The server says the blow landed, missed or was blocked: only now may the strike frame show. */
export const strike = (clock: number, effect: number): Swing => ({ phase: 'strike', since: clock, effectAt: performance.now(), effect });

/** Which attack frame to draw, or null when the beat is at rest. */
export function swingFrame(s: Swing, clock: number): number | null {
  switch (s.phase) {
    case 'rest': return null;
    case 'windup': return clock - s.since < HOLD_AFTER ? WINDUP : HOLD;
    case 'strike': return clock - s.since < STRIKE_HOLD ? STRIKE : RECOVER;
    case 'recover': return RECOVER;
  }
}

/** Knockback offset in tiles: out in 40 ms, eased back over 180 ms. */
export function knockOffset(age: number, amount: number) {
  if (age < 0 || age > 220) return 0;
  if (age < 40) return amount * (age / 40);
  const k = (age - 40) / 180;
  return amount * (1 - k) * (1 - k);
}
/** Camera kick envelope in whole render pixels: full for two frames' worth, then steps down to zero by 140 ms. */
export const kickPixels = (age: number, amount: number) => (age < 0 || age > 140 ? 0 : Math.round(amount * (1 - age / 140)));
