import { randomUUID } from "node:crypto";
import type { Space } from "spectrum-ts";

export type Session = {
  id: string;
  space: Space;
  mood: string;
  vibeDescription: string;
  corgiText: string;
  trackUrl: string | null;
  distress: { active: boolean; timer: NodeJS.Timeout | null };
};

const bySessionId = new Map<string, Session>();
const bySpaceId = new Map<string, string>();

/**
 * Spaces belonging to a buddy we escalated to. The old backend started a full
 * rave for any unknown chat, so when the buddy replied "what's wrong?" they got
 * their own session — and the check-in narrated the USER's calendar to them.
 */
const buddySpaceIds = new Set<string>();

export function markBuddySpace(spaceId: string): void {
  buddySpaceIds.add(spaceId);
}

export function isBuddySpace(spaceId: string): boolean {
  return buddySpaceIds.has(spaceId);
}

export function create(space: Space): Session {
  const session: Session = {
    id: randomUUID(),
    space,
    mood: "",
    vibeDescription: "",
    corgiText: "",
    trackUrl: null,
    distress: { active: false, timer: null },
  };
  bySessionId.set(session.id, session);
  bySpaceId.set(space.id, session.id);
  return session;
}

export function get(sessionId: string): Session | null {
  return bySessionId.get(sessionId) ?? null;
}

export function getBySpace(spaceId: string): Session | null {
  const id = bySpaceId.get(spaceId);
  return id ? (bySessionId.get(id) ?? null) : null;
}
