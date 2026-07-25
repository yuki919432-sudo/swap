// Real PostgREST round-trip integration test for the membership RPCs.
//
// Runs against a DISPOSABLE local Supabase stack (`supabase start`) — the actual
// PostgREST API boundary + Auth, with all migrations applied from clean. It only
// creates synthetic users/schools. It never touches production and needs no
// production secrets (the CLI mints throwaway local keys).
//
// Env (from `supabase status`): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
//
// Proves (item A of the Email OTP checkpoint): invitation / roster / manual
// resolution work through the API; unauthorized + cross-school calls fail;
// suspended / rejected members are blocked; client-safe error codes survive the
// PostgREST boundary; no internal/sensitive detail leaks; and functions that are
// NOT on the client allowlist are not executable by anon or authenticated roles.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "Password123!";

if (!URL || !ANON || !SERVICE) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let n = 0;
let failed = 0;
const ok = (cond, desc) => {
  n += 1;
  console.log(`${cond ? "ok" : "not ok"} ${n} - ${desc}`);
  if (!cond) failed += 1;
};
const must = (label, { error }) => {
  if (error) throw new Error(`${label}: ${error.message ?? JSON.stringify(error)}`);
};

// Mirror the deterministic DB hashes (app.hash_code / app.hash_email) so we can
// seed invitations + roster entries without the plaintext ever touching the DB.
const normalizeEmail = (e) => e.trim().toLowerCase();
const hashCode = (c) => createHash("sha256").update(c.trim(), "utf8").digest("hex");
const hashEmail = (e) => createHash("sha256").update(normalizeEmail(e), "utf8").digest("hex");

// Substrings that would indicate an internal/sensitive leak in an error surfaced
// to a client.
const LEAK_MARKERS = [
  "code_hash",
  "code_salt",
  "search_path",
  "pg_catalog",
  "security definer",
  "private.",
  "auth.users",
  "syntax error",
  "operator does not exist",
  "relation ",
  "column ",
];
const looksSafe = (err) => {
  const blob = JSON.stringify(err ?? {}).toLowerCase();
  return !LEAK_MARKERS.some((m) => blob.includes(m.toLowerCase()));
};

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}
const userClient = (token) =>
  createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

async function makeUser({ email, schoolId, status, role }) {
  const created = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  must(`createUser ${email}`, created);
  const id = created.data.user.id;
  must(`profile ${email}`, await svc.from("users").insert({ id, display_name: "U" }));
  if (schoolId && status) {
    must(`membership ${email}`, await svc.from("school_memberships").insert({ school_id: schoolId, user_id: id, status }));
  }
  if (schoolId && role) {
    must(`admin ${email}`, await svc.from("school_admins").insert({ school_id: schoolId, user_id: id, role }));
  }
  return { id, email, client: userClient(await signIn(email)) };
}

async function enableMethods(schoolId, methods) {
  must(
    `settings ${schoolId}`,
    await svc.from("school_settings").upsert({ school_id: schoolId, enabled_verification_methods: methods }),
  );
}

async function main() {
  const tag = randomUUID().slice(0, 8);
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  must("schoolA", await svc.from("schools").insert({ id: schoolA, name: "A", slug: `a-${tag}`, status: "active" }));
  must("schoolB", await svc.from("schools").insert({ id: schoolB, name: "B", slug: `b-${tag}`, status: "active" }));
  await enableMethods(schoolA, ["invite_code", "roster", "manual"]);
  await enableMethods(schoolB, ["invite_code", "roster", "manual"]);

  // ---- 1. Invitation redemption works through PostgREST --------------------
  {
    const code = `INVITE-${tag}-AAAA`;
    must(
      "seed invitation",
      await svc.from("invitations").insert({
        school_id: schoolA,
        code_prefix: code.slice(0, 9),
        code_hash: hashCode(code),
        type: "shared",
        max_uses: 10,
      }),
    );
    const u = await makeUser({ email: `inv-${tag}@a.test` });
    const { data, error } = await u.client.rpc("redeem_invitation", { p_code: code });
    ok(!error && data?.status === "verified" && data?.verification_method === "invite_code",
      "invitation redemption returns a verified membership via PostgREST");
  }

  // ---- 2. Roster resolution works through PostgREST ------------------------
  {
    const email = `roster-${tag}@a.test`;
    must(
      "seed roster",
      await svc.from("student_roster_entries").insert({
        school_id: schoolA,
        email_normalized: normalizeEmail(email),
        email_hash: hashEmail(email),
      }),
    );
    const u = await makeUser({ email });
    const { data, error } = await u.client.rpc("resolve_roster_membership", { p_school: schoolA });
    ok(!error && data?.status === "verified" && data?.verification_method === "roster",
      "roster resolution returns a verified membership via PostgREST");
  }

  // ---- 3. Manual request works; reviewer approval works -------------------
  {
    const applicant = await makeUser({ email: `manual-${tag}@a.test` });
    const req = await applicant.client.rpc("request_membership", {
      p_school: schoolA,
      p_grad_year: 2027,
      p_explanation: "Transfer student",
    });
    ok(!req.error && req.data?.status === "pending", "manual membership request is created via PostgREST");

    const reviewer = await makeUser({ email: `rev-${tag}@a.test`, schoolId: schoolA, role: "membership_reviewer" });
    const dec = await reviewer.client.rpc("review_membership_request", {
      p_request: req.data.id,
      p_approve: true,
      p_reason: null,
    });
    ok(!dec.error && dec.data?.status === "approved", "reviewer approval succeeds via PostgREST");
  }

  // ---- 4. Unauthorized: a non-reviewer cannot review ----------------------
  {
    const applicant = await makeUser({ email: `manual2-${tag}@a.test` });
    const req = await applicant.client.rpc("request_membership", { p_school: schoolA });
    must("seed request", req);
    const outsider = await makeUser({ email: `outsider-${tag}@a.test`, schoolId: schoolA, status: "verified" });
    const { error } = await outsider.client.rpc("review_membership_request", {
      p_request: req.data.id,
      p_approve: true,
    });
    ok(!!error && looksSafe(error), "a non-reviewer cannot approve a request (authorization enforced at the API)");
    ok(!!error && /not_authorized/.test(error.message ?? ""), "the denial surfaces the client-safe not_authorized code");
  }

  // ---- 5. Cross-school: a School B reviewer cannot review a School A request
  {
    const applicant = await makeUser({ email: `manual3-${tag}@a.test` });
    const req = await applicant.client.rpc("request_membership", { p_school: schoolA });
    must("seed request", req);
    const reviewerB = await makeUser({ email: `revb-${tag}@b.test`, schoolId: schoolB, role: "membership_reviewer" });
    const { error } = await reviewerB.client.rpc("review_membership_request", {
      p_request: req.data.id,
      p_approve: true,
    });
    ok(!!error && /not_authorized/.test(error.message ?? ""), "a cross-school reviewer cannot review another school's request");
  }

  // ---- 6. Suspended + rejected members are blocked from re-resolving ------
  {
    const email = `susp-${tag}@a.test`;
    must("seed roster susp", await svc.from("student_roster_entries").insert({
      school_id: schoolA, email_normalized: normalizeEmail(email), email_hash: hashEmail(email),
    }));
    const u = await makeUser({ email, schoolId: schoolA, status: "suspended" });
    const { error } = await u.client.rpc("resolve_roster_membership", { p_school: schoolA });
    ok(!!error && /membership_suspended/.test(error.message ?? ""), "a suspended member is blocked from re-resolving via roster");

    const email2 = `rej-${tag}@a.test`;
    must("seed roster rej", await svc.from("student_roster_entries").insert({
      school_id: schoolA, email_normalized: normalizeEmail(email2), email_hash: hashEmail(email2),
    }));
    const u2 = await makeUser({ email: email2, schoolId: schoolA, status: "rejected" });
    const r2 = await u2.client.rpc("resolve_roster_membership", { p_school: schoolA });
    ok(!!r2.error && /membership_rejected/.test(r2.error.message ?? ""), "a rejected member is blocked from re-resolving via roster");
  }

  // ---- 7. Client-safe error codes survive; no sensitive leakage -----------
  {
    const u = await makeUser({ email: `badinvite-${tag}@a.test` });
    const { error } = await u.client.rpc("redeem_invitation", { p_code: `NO-SUCH-CODE-${tag}` });
    ok(!!error && /invalid_or_exhausted_invitation/.test(error.message ?? ""),
      "a bad invitation returns the generic invalid_or_exhausted_invitation code");
    ok(!!error && looksSafe(error), "the invitation error leaks no internal/sensitive detail");
    // The plaintext code must never be echoed back in the error.
    ok(!JSON.stringify(error).includes(`NO-SUCH-CODE-${tag}`), "the submitted code is not echoed in the error");
  }

  // ---- 8. Non-allowlisted functions are not executable via PostgREST ------
  {
    const u = await makeUser({ email: `probe-${tag}@a.test`, schoolId: schoolA, status: "verified" });
    // request_otp_challenge is service-role only — an authenticated caller must be denied.
    const chal = await u.client.rpc("request_otp_challenge", {
      p_user: u.id,
      p_school: schoolA,
      p_email_normalized: u.email,
      p_purpose: "school_membership_verification",
      p_code_hash: hashCode("000000"),
      p_code_salt: "x",
    });
    ok(!!chal.error, "an authenticated caller cannot execute the service-role-only request_otp_challenge");

    // record_email_event is service-role only too.
    const rec = await u.client.rpc("record_email_event", {
      p_provider: "postmark",
      p_provider_message_id: "x",
      p_event: "delivered",
      p_email_normalized: u.email,
    });
    ok(!!rec.error, "an authenticated caller cannot execute the service-role-only record_email_event");

    // An anon caller cannot execute an authenticated-only membership RPC.
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const anonCall = await anon.rpc("resolve_roster_membership", { p_school: schoolA });
    ok(!!anonCall.error, "an anonymous caller cannot execute resolve_roster_membership");
  }

  console.log(`1..${n}`);
  console.log(`# membership integration: ${n - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
