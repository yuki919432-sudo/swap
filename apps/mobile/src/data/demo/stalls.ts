/**
 * Synthetic demo student stalls. A stall is a casual personal profile over a
 * student's listings — never a business storefront. All fictional; no real data.
 *
 * A stall's `userId` matches the demo profile id where one exists (so "My Stall"
 * resolves for the selectable personas), and a synthetic id otherwise. The stall's
 * listings are derived at read time from demoListings by matching the owner name +
 * school, so we never duplicate listing content here.
 */
import type { OwnerPreview } from "../../domain/models";

export interface DemoStall {
  id: string;
  schoolId: string;
  userId: string;
  owner: OwnerPreview;
  description: string | null;
  createdAt: string;
}

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString();
const owner = (displayName: string, avatarEmoji: string, verified = true): OwnerPreview => ({ displayName, avatarEmoji, verified });

export const demoStalls: DemoStall[] = [
  // Riverton University — userIds tie to selectable profiles where they exist.
  {
    id: "stall-uni-maya",
    schoolId: "school-uni",
    userId: "profile-uni-verified",
    owner: owner("Maya", "🌸"),
    description: "Textbooks and little music odds and ends I'm passing along.",
    createdAt: hoursAgo(4),
  },
  {
    id: "stall-uni-priya",
    schoolId: "school-uni",
    userId: "u-priya",
    owner: owner("Priya", "🪴"),
    description: "Dorm plants gone, electronics staying — happy to swap.",
    createdAt: hoursAgo(8),
  },
  {
    id: "stall-uni-theo",
    schoolId: "school-uni",
    userId: "u-theo",
    owner: owner("Theo", "🧗"),
    description: "Climbing and cycling gear I've outgrown.",
    createdAt: hoursAgo(40),
  },
  {
    id: "stall-uni-devin",
    schoolId: "school-uni",
    userId: "profile-uni-moderator",
    owner: owner("Devin", "🛡️"),
    description: null,
    createdAt: hoursAgo(60),
  },
  // Maple Grove High
  {
    id: "stall-hs-alex",
    schoolId: "school-hs",
    userId: "profile-hs-verified",
    owner: owner("Alex", "⚡"),
    description: "Workbooks and art club leftovers.",
    createdAt: hoursAgo(6),
  },
  {
    id: "stall-hs-riley",
    schoolId: "school-hs",
    userId: "u-riley",
    owner: owner("Riley", "🥅"),
    description: "Outgrown sports gear looking for a new home.",
    createdAt: hoursAgo(12),
  },
];

export const demoStallById = (id: string): DemoStall | undefined => demoStalls.find((s) => s.id === id);
export const demoStallsForSchool = (schoolId: string): DemoStall[] => demoStalls.filter((s) => s.schoolId === schoolId);
