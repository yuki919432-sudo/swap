// img_seed.mjs — provision IMG Academy as the first real production tenant, over the
// Supabase HTTPS API (service_role), so it works from any network without a direct
// Postgres connection. Idempotent. No auth users, no roster, no real student data.
// The school owner/moderator is promoted later once a real staff member signs up
// (supabase/production/02_promote_owner.sql), so this only stands up the tenant + a
// shared invitation code.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/production/img_seed.mjs
//
// Optional env: IMG_SCHOOL_NAME, IMG_SCHOOL_SLUG, IMG_INVITE_CODE, IMG_INVITE_MAX_USES.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const URL = need("SUPABASE_URL");
const SERVICE = need("SUPABASE_SERVICE_ROLE_KEY");
const NAME = process.env.IMG_SCHOOL_NAME || "IMG Academy";
const SLUG = process.env.IMG_SCHOOL_SLUG || "img-academy";
const CODE = process.env.IMG_INVITE_CODE || "IMG-SWAP-2026";
const MAX_USES = Number.parseInt(process.env.IMG_INVITE_MAX_USES || "500", 10);

function need(k) {
  const v = process.env[k];
  if (!v) { console.error(`Missing required env ${k}`); process.exit(1); }
  return v;
}
// Mirrors app.hash_code: sha256(btrim(code)) as lowercase hex. Only the hash is stored.
const hashCode = (c) => createHash("sha256").update(c.trim(), "utf8").digest("hex");

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function main() {
  // 1) school (active). Idempotent on the unique slug.
  const up = await admin.from("schools").upsert({ name: NAME, slug: SLUG, status: "active" }, { onConflict: "slug" }).select("id").single();
  if (up.error) throw new Error(`school upsert: ${up.error.message}`);
  const schoolId = up.data.id;

  // 2) settings: invitation code + manual approval fallback; regulated categories stay
  //    OFF by default (enabled_categories empty). No roster.
  const s = await admin.from("school_settings").upsert(
    { school_id: schoolId, enabled_verification_methods: ["invite_code", "manual"] },
    { onConflict: "school_id" },
  );
  if (s.error) throw new Error(`settings upsert: ${s.error.message}`);

  // 3) safe on-campus handoff locations (edit later in the DB / admin tools).
  for (const nm of ["Main Campus Center", "Library Entrance", "Dining Hall Lobby"]) {
    const exists = await admin.from("safe_handoff_locations").select("id").eq("school_id", schoolId).eq("name", nm).limit(1);
    if ((exists.data ?? []).length === 0) {
      const h = await admin.from("safe_handoff_locations").insert({ school_id: schoolId, name: nm });
      if (h.error) throw new Error(`handoff insert (${nm}): ${h.error.message}`);
    }
  }

  // 4) shared invitation code (only its hash is stored). Idempotent on code_hash.
  const codeHash = hashCode(CODE);
  const inv = await admin.from("invitations").select("id").eq("code_hash", codeHash).limit(1);
  if ((inv.data ?? []).length === 0) {
    const i = await admin.from("invitations").insert({
      school_id: schoolId, code_prefix: CODE.slice(0, 9), code_hash: codeHash,
      type: "shared", max_uses: MAX_USES, requires_approval: false,
    });
    if (i.error) throw new Error(`invitation insert: ${i.error.message}`);
  }

  console.log("IMG_SCHOOL_ID=" + schoolId);
  console.log("IMG_INVITE_CODE=" + CODE);
  console.log("IMG Academy tenant ready (active; invite_code + manual; regulated categories off).");
  console.log("Next: promote a real IMG staff account to owner/moderator once they sign up");
  console.log("      (supabase/production/02_promote_owner.sql -v school_id=" + schoolId + " -v owner_email=...).");
}

main().then(() => process.exit(0), (e) => { console.error(String(e.message || e)); process.exit(1); });
