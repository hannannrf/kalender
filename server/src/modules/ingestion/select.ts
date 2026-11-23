// BR-02: which messages of an export may be read, given what was read before. Pure.
import type { Message } from './parse';

export type Pointers = {
  /** Approval Time minus the Look-back Period, truncated to the minute (R2-5). */
  startPoint: Date;
  /** Sent time of the newest message already read; null before the first read. */
  readUpTo: Date | null;
  /** How many messages with each fingerprint were already read in the Read-up-to minute (section 8, Q-25). */
  boundary: Record<string, number>;
};

export type Selection = { eligible: Message[]; readUpTo: Date | null; boundary: Record<string, number> };

export function selectEligible(messages: Message[], pointers: Pointers): Selection {
  const { startPoint, readUpTo, boundary } = pointers;
  const start = startPoint.getTime();
  const upTo = readUpTo?.getTime();
  const seenAtBoundary = new Map<string, number>();

  const eligible = messages.filter((m) => {
    const t = m.sentAt.getTime();
    if (t < start) return false;
    if (upTo === undefined || t > upTo) return true;
    if (t < upTo) return false;
    // Same minute as the Read-up-to Point: read only the copies of a message not counted before.
    const n = (seenAtBoundary.get(m.fingerprint) ?? 0) + 1;
    seenAtBoundary.set(m.fingerprint, n);
    return n > (boundary[m.fingerprint] ?? 0);
  });

  const newest = eligible.reduce((max, m) => Math.max(max, m.sentAt.getTime()), upTo ?? -Infinity);
  if (newest === -Infinity) return { eligible, readUpTo: null, boundary: {} };

  const counts: Record<string, number> = newest === upTo ? { ...boundary } : {};
  const inFile: Record<string, number> = {};
  for (const m of messages) {
    if (m.sentAt.getTime() === newest && m.sentAt.getTime() >= start) inFile[m.fingerprint] = (inFile[m.fingerprint] ?? 0) + 1;
  }
  for (const [fp, n] of Object.entries(inFile)) counts[fp] = Math.max(counts[fp] ?? 0, n);

  return { eligible, readUpTo: new Date(newest), boundary: counts };
}
