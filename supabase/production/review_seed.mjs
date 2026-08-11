// review_seed.mjs — stand up a fully SYNTHETIC "App Review" school so an App Store
// reviewer can traverse the whole app with ZERO dependence on a real student, a real
// school employee, a roster, or any manual step during review.
//
// It creates: a review-only school (+ settings + safe handoff locations), a verified
// "seller" account that owns a few listings, and a verified reviewer account that is
// ALSO a school moderator (so one login can browse, message, offer, report, AND work
// the moderation queue). Finally it mints a shared invitation code.
//
// Operator-run, ONCE, against the production (or a dedicated review) Supabase project.
// Requires the service-role key — run it from a trusted machine, never the app.
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   REVIEW_PASSWORD='<pick-one>' node supabase/production/review_seed.mjs
//
// All data is synthetic. Keep this OUT of the real pilot school — it seeds its own
// isolated school so fake data never mixes with real students.
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";

// Mirrors app.hash_code: sha256(btrim(code)) as lowercase hex. Only the hash is
// ever stored; the plaintext lives only in the operator's App Review Notes.
const hashCode = (code) => createHash("sha256").update(code.trim(), "utf8").digest("hex");

const URL = need("SUPABASE_URL");
const SERVICE = need("SUPABASE_SERVICE_ROLE_KEY");
const PASSWORD = process.env.REVIEW_PASSWORD || "ReviewPass123!";
const REVIEWER_EMAIL = process.env.REVIEW_EMAIL || "appreview@swap-review.test";
const SELLER_EMAIL = process.env.REVIEW_SELLER_EMAIL || "seller@swap-review.test";
const CODE = process.env.REVIEW_INVITE_CODE || "SWAP-REVIEW-2026";

function need(k) {
  const v = process.env[k];
  if (!v) {
    console.error(`Missing required env ${k}`);
    process.exit(1);
  }
  return v;
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function ensureUser(email) {
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.data?.user) return created.data.user.id;
  // Already exists → look it up by listing (best-effort) via the admin API.
  const list = await admin.auth.admin.listUsers();
  const found = list.data?.users?.find((u) => u.email === email);
  if (!found) throw new Error(`could not create or find user ${email}: ${created.error?.message}`);
  return found.id;
}

async function main() {
  const schoolId = randomUUID();
  const slug = `review-pilot-${schoolId.slice(0, 8)}`;

  // 1) school + settings + handoff locations
  await admin.from("schools").insert({ id: schoolId, name: "SWAP! Review School (synthetic)", slug, status: "active" });
  await admin.from("school_settings").upsert({ school_id: schoolId, enabled_verification_methods: ["invite_code", "manual"] });
  await admin.from("safe_handoff_locations").insert([
    { school_id: schoolId, name: "Library Entrance" },
    { school_id: schoolId, name: "Student Center" },
  ]);

  // 2) accounts (reviewer is also a moderator so one login demonstrates everything)
  const reviewerId = await ensureUser(REVIEWER_EMAIL);
  const sellerId = await ensureUser(SELLER_EMAIL);
  await admin.from("users").upsert([
    { id: reviewerId, display_name: "App Reviewer" },
    { id: sellerId, display_name: "Sam (synthetic)" },
  ]);
  await admin.from("school_memberships").upsert(
    [
      { school_id: schoolId, user_id: reviewerId, status: "verified", verification_method: "manual", verified_at: new Date().toISOString() },
      { school_id: schoolId, user_id: sellerId, status: "verified", verification_method: "manual", verified_at: new Date().toISOString() },
    ],
    { onConflict: "school_id,user_id" },
  );
  await admin.from("school_admins").upsert(
    { school_id: schoolId, user_id: reviewerId, role: "school_moderator", active: true },
    { onConflict: "school_id,user_id" },
  );

  // 3) a few listings owned by the seller, so the reviewer has real content to
  //    browse / message / make an offer on.
  const L = (title, post_type, category) => ({
    school_id: schoolId, owner_id: sellerId, post_type, title, description: "Synthetic review item.",
    category, condition: "good", status: "active",
  });
  await admin.from("listings").insert([
    L("Desk lamp", "give", "dormitory_items"),
    L("Graphing calculator", "swap", "electronics"),
    L("Physics textbook", "lend", "textbooks"),
  ]);

  console.log("---------------------------------------------------------------");
  console.log("Review school ready (synthetic). Put these in App Review Notes:");
  console.log("  school_id (EXPO_PUBLIC_PILOT_SCHOOL_ID for the review build):", schoolId);
  console.log("  Reviewer login:", REVIEWER_EMAIL, "/", PASSWORD, "(verified + moderator)");
  console.log("  Invitation code (optional, to demo enrollment):", CODE);
  console.log("  Seller (owns the sample listings):", SELLER_EMAIL);
  console.log("---------------------------------------------------------------");

  // 4) invitation code (shared) — only its sha256 hash + a short prefix are stored.
  const { error: invErr } = await admin.from("invitations").insert({
    school_id: schoolId,
    code_prefix: CODE.slice(0, 9),
    code_hash: hashCode(CODE),
    type: "shared",
    max_uses: 50,
    requires_approval: false,
  });
  if (invErr) console.warn("invitation insert warning:", invErr.message);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
