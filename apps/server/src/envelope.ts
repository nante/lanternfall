import { z } from 'zod';
import { Envelope } from '../../../packages/game/src/model.ts';

const Header = z.object({ requestId: z.string().uuid(), epoch: z.number().int(), seq: z.number().int().positive() });
export type Header = z.infer<typeof Header>;

/** Read an action message. One the server cannot act on still yields its header when that much is valid, so the sequence can move past it. */
export function readEnvelope(input: unknown): { ok: true; req: z.infer<typeof Envelope> } | { ok: false; header: Header | undefined } {
  const full = Envelope.safeParse(input);
  if (full.success) return { ok: true, req: full.data };
  const header = Header.safeParse(input);
  return { ok: false, header: header.success ? header.data : undefined };
}
