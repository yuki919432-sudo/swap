/**
 * Synthetic inbox threads for the Inbox preview. Fictional. Messaging itself is a
 * "Coming soon" placeholder — no Realtime, no real conversations.
 */
import type { InboxThread, OwnerPreview } from "../../domain/models";

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString();
const person = (displayName: string, avatarEmoji: string): OwnerPreview => ({ displayName, avatarEmoji, verified: true });

export const demoInbox: InboxThread[] = [
  {
    id: "t-uni-1",
    schoolId: "school-uni",
    counterpart: person("Priya", "🪴"),
    contextLabel: "Graphing calculator for a desk lamp",
    preview: "Is the calculator still available to swap?",
    unread: 2,
    lastAt: hoursAgo(1),
  },
  {
    id: "t-uni-2",
    schoolId: "school-uni",
    counterpart: person("Sam", "🎧"),
    contextLabel: "Looking for a mini fridge",
    preview: "Thanks! I can pick it up tomorrow afternoon.",
    unread: 0,
    lastAt: hoursAgo(5),
  },
  {
    id: "t-hs-1",
    schoolId: "school-hs",
    counterpart: person("Riley", "🥅"),
    contextLabel: "Soccer cleats (US 7) for shin guards",
    preview: "Do the cleats still fit a size 7?",
    unread: 1,
    lastAt: hoursAgo(3),
  },
];
