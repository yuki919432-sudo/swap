/**
 * Synthetic demo schools. Entirely fictional — NO real school names, domains, or
 * data. Names use the ".demo" suffix to make the synthetic nature obvious.
 */
import type { DemoSchool } from "../../domain/models";

export const demoSchools: DemoSchool[] = [
  {
    id: "school-uni",
    name: "Riverton University (Demo)",
    institutionType: "university",
    description: "A mid-size campus community swapping textbooks, dorm gear, and gently used everyday things.",
    memberCount: 4820,
    // Pilot posture: invitation codes + manual approval, plus email OTP where
    // deliverability is confirmed. No roster (optional adapter, off by default).
    verificationMethods: ["invite_code", "manual", "email_otp"],
    accentEmoji: "🎓",
  },
  {
    id: "school-hs",
    name: "Maple Grove High (Demo)",
    institutionType: "high_school",
    description: "A tight-knit high school passing along calculators, cleats, and club supplies.",
    memberCount: 940,
    // Default pilot posture: invitation codes + manual approval only.
    verificationMethods: ["invite_code", "manual"],
    accentEmoji: "🍁",
  },
];

export const demoSchoolById = (id: string): DemoSchool | undefined =>
  demoSchools.find((s) => s.id === id);
