import { GameState, type State } from './model.ts';

/** A saved world, read back. `state` is undefined when there was no save yet. */
export type LoadedWorld = { ok: true; state: State | undefined } | { ok: false; problems: string[] };

/**
 * Parse a saved world. Fields added since the save was written take their schema defaults; anything else that
 * does not fit is reported by path so the save can be fixed by hand rather than replaced.
 */
export function loadWorld(raw: string | undefined, limit = 20): LoadedWorld {
  if (raw === undefined) return { ok: true, state: undefined };
  let json: unknown;
  try { json = JSON.parse(raw); } catch (error) { return { ok: false, problems: [`(whole save): not JSON (${(error as Error).message})`] }; }
  const parsed = GameState.safeParse(json);
  if (parsed.success) return { ok: true, state: parsed.data };
  const problems = parsed.error.issues.slice(0, limit).map(i => `${i.path.join('.') || '(whole save)'}: ${i.message}`);
  if (parsed.error.issues.length > limit) problems.push(`and ${parsed.error.issues.length - limit} more`);
  return { ok: false, problems };
}
