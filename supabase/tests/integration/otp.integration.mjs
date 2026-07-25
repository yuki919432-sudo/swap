// Real PostgREST round-trip integration test for the Email OTP flow.
//
// Runs against a DISPOSABLE local Supabase stack (`supabase start`). It drives the
// request path via the SERVICE ROLE (as the otp-request Edge Function would) and
// the verify path via an AUTHENTICATED client, over the real PostgREST + Auth
// boundary. Only synthetic users/schools are created; no production, no secrets.
//
// Env (from `supabase status`): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
//
// Proves: request→verify works end to end; a School A OTP cannot verify School B;
// an OTP issued to one user cannot be verified by another; suspended members are
// blocked; app users cannot read OTP hashes or private delivery data; the webhook
// record RPC is service-role-only + idempotent; and admin delivery status is
// role-gated + masked.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";

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

// Match the DB's otp code hashing: sha256(salt || code).
const otpCodeHash = (salt, code) => createHash("sha256").update(salt + code, "utf8").digest("hex");
const genCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const genSalt = () => randomBytes(16).toString("hex");

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

// Issue a challenge the way the Edge Function does: generate the code locally,
// send only the hash+salt to the service-role RPC. Returns the plaintext code
// (kept only in the test process, never persisted).
async function issue(user, schoolId) {
  const code = genCode();
  const salt = genSalt();
  const { data, error } = await svc.rpc("request_otp_challenge", {
    p_user: user.id,
    p_school: schoolId,
    p_email_normalized: user.email,
    p_purpose: "school_membership_verification",
    p_code_hash: otpCodeHash(salt, code),
    p_code_salt: salt,
  });
  must("request_otp_challenge", { error });
  return { code, challengeId: data };
}

async function main() {
  const tag = randomUUID().slice(0, 8);
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  must("schoolA", await svc.from("schools").insert({ id: schoolA, name: "A", slug: `a-${tag}`, status: "active" }));
  must("schoolB", await svc.from("schools").insert({ id: schoolB, name: "B", slug: `b-${tag}`, status: "active" }));
  must("settingsA", await svc.from("school_settings").upsert({ school_id: schoolA, enabled_verification_methods: ["email_otp"] }));
  must("settingsB", await svc.from("school_settings").upsert({ school_id: schoolB, enabled_verification_methods: ["email_otp"] }));

  // ---- 1. request → verify happy path -------------------------------------
  {
    const u = await makeUser({ email: `otp-${tag}@a.test` });
    const { code } = await issue(u, schoolA);
    const { data, error } = await u.client.rpc("verify_email_otp", { p_school: schoolA, p_code: code });
    ok(!error && data?.ok === true && data?.membership?.status === "verified",
      "a valid OTP verifies and returns a verified membership via PostgREST");

    // Replay of the same code is rejected (challenge already consumed).
    const replay = await u.client.rpc("verify_email_otp", { p_school: schoolA, p_code: code });
    ok(!replay.error && replay.data?.ok === false && replay.data?.error === "otp_invalid",
      "replaying a consumed OTP is rejected");
  }

  // ---- 2. wrong code increments attempts; correct still verifies ----------
  {
    const u = await makeUser({ email: `otp2-${tag}@a.test` });
    const { code } = await issue(u, schoolA);
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await u.client.rpc("verify_email_otp", { p_school: schoolA, p_code: wrong });
    ok(!bad.error && bad.data?.ok === false && bad.data?.error === "otp_invalid", "a wrong code returns otp_invalid without raising");
    const good = await u.client.rpc("verify_email_otp", { p_school: schoolA, p_code: code });
    ok(!good.error && good.data?.ok === true, "the correct code still verifies after a wrong attempt");
  }

  // ---- 3. A School A OTP cannot verify School B ---------------------------
  {
    const u = await makeUser({ email: `otp3-${tag}@a.test` });
    const { code } = await issue(u, schoolA); // bound to School A
    const cross = await u.client.rpc("verify_email_otp", { p_school: schoolB, p_code: code });
    ok(!cross.error && cross.data?.ok === false && cross.data?.error === "otp_invalid",
      "a School A OTP cannot verify membership in School B");
    // And no School B membership was created.
    const { data: rows } = await svc.from("school_memberships").select("id").eq("school_id", schoolB).eq("user_id", u.id);
    ok((rows ?? []).length === 0, "no School B membership is created by a School A OTP");
  }

  // ---- 4. An OTP issued to one user cannot be verified by another ---------
  {
    const owner = await makeUser({ email: `otp4a-${tag}@a.test` });
    const other = await makeUser({ email: `otp4b-${tag}@a.test` });
    const { code } = await issue(owner, schoolA); // bound to owner's email
    // `other` submits the owner's code; verify reads `other`'s own email from the
    // session, so no challenge matches -> otp_invalid.
    const res = await other.client.rpc("verify_email_otp", { p_school: schoolA, p_code: code });
    ok(!res.error && res.data?.ok === false && res.data?.error === "otp_invalid",
      "another user cannot verify with someone else's OTP");
    // The owner can still verify with their own code (it was not consumed).
    const ownerRes = await owner.client.rpc("verify_email_otp", { p_school: schoolA, p_code: code });
    ok(!ownerRes.error && ownerRes.data?.ok === true, "the rightful owner can still verify their own OTP");
  }

  // ---- 5. Suspended member is blocked; no partial state -------------------
  {
    const u = await makeUser({ email: `otp5-${tag}@a.test`, schoolId: schoolA, status: "suspended" });
    const { code } = await issue(u, schoolA);
    const res = await u.client.rpc("verify_email_otp", { p_school: schoolA, p_code: code });
    ok(!res.error && res.data?.ok === false && res.data?.error === "membership_suspended", "a suspended member is blocked from OTP verification");
    const { data: rows } = await svc.from("school_memberships").select("status").eq("school_id", schoolA).eq("user_id", u.id);
    ok((rows ?? [])[0]?.status === "suspended", "the suspended membership is not flipped to verified");
  }

  // ---- 6. App users cannot read OTP hashes or private delivery data -------
  {
    const u = await makeUser({ email: `otp6-${tag}@a.test`, schoolId: schoolA, status: "verified" });
    // The private schema is not exposed via PostgREST; querying the OTP table fails.
    const chal = await u.client.from("otp_challenges").select("code_hash").limit(1);
    ok(!!chal.error, "an app user cannot select from private.otp_challenges via PostgREST");
    const ev = await u.client.from("email_events").select("*").limit(1);
    ok(!!ev.error, "an app user cannot select from private.email_events via PostgREST");
  }

  // ---- 7. Webhook record RPC is service-role-only + idempotent ------------
  {
    const messageId = `pm-${tag}-1`;
    const first = await svc.rpc("record_email_event", {
      p_provider: "postmark",
      p_provider_message_id: messageId,
      p_event: "delivered",
      p_email_normalized: `otp-${tag}@a.test`,
      p_school: schoolA,
      p_detail: {},
      p_signature_verified: true,
    });
    ok(!first.error && first.data === true, "a verified delivery event is recorded once");
    const dup = await svc.rpc("record_email_event", {
      p_provider: "postmark",
      p_provider_message_id: messageId,
      p_event: "delivered",
      p_email_normalized: `otp-${tag}@a.test`,
      p_school: schoolA,
    });
    ok(!dup.error && dup.data === false, "a replayed webhook event is a no-op (idempotent)");

    const u = await makeUser({ email: `otp7-${tag}@a.test`, schoolId: schoolA, status: "verified" });
    const denied = await u.client.rpc("record_email_event", {
      p_provider: "postmark",
      p_provider_message_id: `pm-${tag}-2`,
      p_event: "delivered",
      p_email_normalized: `otp-${tag}@a.test`,
    });
    ok(!!denied.error, "an authenticated caller cannot record a delivery event");
  }

  // ---- 8. Admin delivery status is role-gated + masked --------------------
  {
    const admin = await makeUser({ email: `otpadmin-${tag}@a.test`, schoolId: schoolA, role: "school_admin" });
    const res = await admin.client.rpc("get_email_delivery_status", { p_school: schoolA, p_limit: 50 });
    ok(!res.error && Array.isArray(res.data), "a school admin can read delivery status");
    const blob = JSON.stringify(res.data ?? []);
    ok(blob.includes("@a.test") && blob.includes("*"), "delivery status emails are masked");
    ok(!blob.includes(`otp-${tag}@a.test`), "the full recipient address is never returned");

    const member = await makeUser({ email: `otpmember-${tag}@a.test`, schoolId: schoolA, status: "verified" });
    const denied = await member.client.rpc("get_email_delivery_status", { p_school: schoolA });
    ok(!!denied.error, "a non-admin member cannot read delivery status");
  }

  console.log(`1..${n}`);
  console.log(`# otp integration: ${n - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
