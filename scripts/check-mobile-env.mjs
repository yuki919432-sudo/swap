// Mobile build environment preflight.
//
// Validates the EXPO_PUBLIC_* environment for the target app mode. A PILOT build
// (preview / production EAS profiles) must ship with a real backend + a working
// support contact, and must never carry a service-role key. Exits non-zero on any
// hard problem so a misconfigured build fails BEFORE it is produced/submitted.
//
// Run with:  node --experimental-strip-types scripts/check-mobile-env.mjs
// (reads the current process environment — set EXPO_PUBLIC_* first, or source your
//  EAS env for the profile you are about to build.)

import { evaluateMobileEnv } from "../apps/mobile/src/config/preflight.ts";

const report = evaluateMobileEnv({
  appMode: process.env.EXPO_PUBLIC_APP_MODE,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL,
  pilotSchoolId: process.env.EXPO_PUBLIC_PILOT_SCHOOL_ID,
  enableDemoMode: process.env.EXPO_PUBLIC_ENABLE_DEMO_MODE,
});

console.log(`SWAP! mobile env preflight — mode: ${report.mode}`);

for (const w of report.warnings) console.log(`  ⚠ ${w}`);
for (const p of report.problems) console.error(`  ✖ ${p}`);

if (!report.ok) {
  console.error(`\nPreflight FAILED: ${report.problems.length} problem(s). Fix the above before building a ${report.mode} release.`);
  process.exit(1);
}

console.log(report.warnings.length > 0 ? "\nPreflight OK (with warnings)." : "\nPreflight OK.");
