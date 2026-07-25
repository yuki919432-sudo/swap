/**
 * Synthetic community items (events, volunteering, clubs, study groups, projects).
 * Fictional. Actions in the UI are "Coming soon" placeholders.
 */
import type { CommunityItem, OwnerPreview } from "../../domain/models";

const daysFromNow = (d: number): string => new Date(Date.now() + d * 86_400_000).toISOString();
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString();
const org = (displayName: string, avatarEmoji: string): OwnerPreview => ({ displayName, avatarEmoji, verified: true });

export const demoCommunity: CommunityItem[] = [
  {
    id: "c-uni-1",
    schoolId: "school-uni",
    type: "volunteer",
    title: "Riverfront cleanup — Saturday morning",
    description: "Join the environmental club for a two-hour cleanup along the river. Gloves and bags provided.",
    organizer: org("Green Campus Club", "🌿"),
    when: daysFromNow(4),
    location: "Riverfront Park",
    createdAt: hoursAgo(6),
  },
  {
    id: "c-uni-2",
    schoolId: "school-uni",
    type: "club_recruitment",
    title: "Robotics club is recruiting",
    description: "No experience needed — we build, we break things, we learn. Weekly meetups in the maker space.",
    organizer: org("Robotics Club", "🤖"),
    when: null,
    location: "Maker Space",
    createdAt: hoursAgo(22),
  },
  {
    id: "c-uni-3",
    schoolId: "school-uni",
    type: "study_group",
    title: "Organic chemistry study group",
    description: "Prepping for the midterm together. Bring your problem sets and questions.",
    organizer: org("Nina", "🎬"),
    when: daysFromNow(2),
    location: "Library Room 3B",
    createdAt: hoursAgo(30),
  },
  {
    id: "c-uni-4",
    schoolId: "school-uni",
    type: "project_recruitment",
    title: "Looking for teammates: campus app hackathon",
    description: "Forming a team for the spring hackathon. Designers and developers welcome.",
    organizer: org("Theo", "🧗"),
    when: daysFromNow(9),
    location: "Innovation Lab",
    createdAt: hoursAgo(40),
  },
  {
    id: "c-hs-1",
    schoolId: "school-hs",
    type: "sports_activity",
    title: "Pickup basketball after school",
    description: "Casual pickup games in the main gym on Thursdays. All skill levels welcome.",
    organizer: org("Riley", "🥅"),
    when: daysFromNow(1),
    location: "Main Gym",
    createdAt: hoursAgo(8),
  },
  {
    id: "c-hs-2",
    schoolId: "school-hs",
    type: "club_recruitment",
    title: "Drama club spring auditions",
    description: "Auditions for the spring play are open. Sign up for a slot at the drama room door.",
    organizer: org("Drama Club", "🎭"),
    when: daysFromNow(6),
    location: "Auditorium",
    createdAt: hoursAgo(26),
  },
  {
    id: "c-hs-3",
    schoolId: "school-hs",
    type: "volunteer",
    title: "Tutoring volunteers for freshmen",
    description: "Upperclassmen wanted to tutor freshmen in math and science one afternoon a week.",
    organizer: org("Peer Tutoring", "📐"),
    when: null,
    location: "Room 214",
    createdAt: hoursAgo(48),
  },
];
