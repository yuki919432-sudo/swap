// Multi-connection concurrency tests for the reservation + invitation invariants.
//
// These use REAL separate PostgreSQL connections (node-postgres), not sequential
// calls in one session. Interleaving is made deterministic by holding one
// transaction open (row locks held) while a second transaction blocks on the
// same rows, then committing the first — so the race outcome is reproducible and
// not timing-dependent. The deadlock scenario relies on Postgres' own deadlock
// detector (SQLSTATE 40P01).
//
// Expected database errors surfaced to the application layer are asserted and
// documented in docs/testing.md.

import pg from "pg";
import { randomUUID } from "node:crypto";

const HOST = process.env.PGHOST || "/var/run/postgresql";
const USER = process.env.PGUSER || "root";
const DB = process.env.SWAP_CONCURRENCY_DB || process.env.PGDATABASE || "swap_concurrency";

const newClient = () => new pg.Client({ host: HOST, user: USER, database: DB });

let count = 0;
let failed = 0;
const ok = (cond, desc) => {
  count += 1;
  if (cond) {
    console.log(`ok ${count} - ${desc}`);
  } else {
    failed += 1;
    console.log(`not ok ${count} - ${desc}`);
  }
};

async function auth(c, uid, aal = "aal1") {
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: uid, role: "authenticated", aal }),
  ]);
  await c.query(`select set_config('role', 'authenticated', false)`);
}

// Poll pg_stat_activity until a backend in this DB is waiting on a Lock while
// running a query that matches `needle`.
async function waitForLock(admin, needle, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await admin.query(
      `select count(*)::int as n from pg_stat_activity
        where datname = $1 and wait_event_type = 'Lock' and query ilike '%' || $2 || '%'`,
      [DB, needle],
    );
    if (r.rows[0].n > 0) return true;
    await new Promise((res) => setTimeout(res, 40));
  }
  return false;
}

const errcode = (e) => (e && e.code) || null;

// ---- shared base fixtures ------------------------------------------------
const school = randomUUID();
const seller = randomUUID();
const buyers = Array.from({ length: 8 }, () => randomUUID());

async function seedBase(admin) {
  await admin.query(`insert into schools (id, name, slug, status) values ($1,'Conc School','conc-school','active')`, [
    school,
  ]);
  await admin.query(
    `insert into school_settings (school_id, enabled_verification_methods) values ($1, array['invite_code','roster','manual']::verification_method[])`,
    [school],
  );
  const users = [seller, ...buyers];
  for (const u of users) {
    await admin.query(`insert into auth.users (id) values ($1)`, [u]);
    await admin.query(`insert into public.users (id, display_name) values ($1, 'U')`, [u]);
    await admin.query(`insert into school_memberships (school_id, user_id, status) values ($1,$2,'verified')`, [
      school,
      u,
    ]);
  }
}

async function mkListing(admin, owner) {
  const id = randomUUID();
  await admin.query(
    `insert into listings (id, school_id, owner_id, post_type, title, description, category)
     values ($1,$2,$3,'swap','L','d','other')`,
    [id, school, owner],
  );
  return id;
}

async function mkOffer(admin, from, items) {
  const id = randomUUID();
  await admin.query(
    `insert into offers (id, school_id, from_user_id, to_user_id, status) values ($1,$2,$3,$4,'sent')`,
    [id, school, from, seller],
  );
  for (const [listing, dir] of items) {
    await admin.query(`insert into offer_items (offer_id, listing_id, direction) values ($1,$2,$3)`, [id, listing, dir]);
  }
  return id;
}

// ---- Scenario 1: two offers competing for one shared listing -------------
async function scenarioSharedListing(admin) {
  console.log("# Scenario 1: competing acceptances for one shared listing");
  const L1 = await mkListing(admin, seller); // requested by both
  const LA = await mkListing(admin, buyers[0]); // offered in A
  const LB = await mkListing(admin, buyers[1]); // offered in B
  const LU = await mkListing(admin, seller); // unrelated, requested only by B
  const OA = await mkOffer(admin, buyers[0], [
    [LA, "offered"],
    [L1, "requested"],
  ]);
  const OB = await mkOffer(admin, buyers[1], [
    [LB, "offered"],
    [L1, "requested"],
    [LU, "requested"],
  ]);

  const a = newClient();
  const b = newClient();
  await a.connect();
  await b.connect();
  let bErr = null;
  try {
    await auth(a, seller);
    await auth(b, seller);
    await a.query("begin");
    await b.query("begin");
    // A accepts first and holds its locks (no commit yet).
    await a.query("select app.accept_offer($1)", [OA]);
    // B attempts to accept; it will block on L1's row lock.
    const bPromise = b.query("select app.accept_offer($1)", [OB]).catch((e) => {
      bErr = e;
    });
    const blocked = await waitForLock(admin, "accept_offer");
    ok(blocked, "the second acceptance blocks on the shared listing lock");
    await a.query("commit"); // release locks -> B unblocks and must fail
    await bPromise;
    await b.query("rollback").catch(() => {});
  } finally {
    await a.end();
    await b.end();
  }

  ok(bErr !== null, "exactly one acceptance fails (the second raises)");
  ok(
    ["P0001", "23505"].includes(errcode(bErr)),
    `the failed acceptance returns a safe error (got ${errcode(bErr)}; expected listing_not_available/23505)`,
  );

  const rc = await admin.query(
    `select count(*)::int n from listing_reservations where listing_id=$1 and status='active'`,
    [L1],
  );
  ok(rc.rows[0].n === 1, "exactly one ACTIVE reservation exists for the shared listing");

  const tc = await admin.query(`select count(*)::int n from transactions where offer_id in ($1,$2)`, [OA, OB]);
  ok(tc.rows[0].n === 1, "exactly one transaction was created");

  const sa = await admin.query(`select status from offers where id=$1`, [OA]);
  const sb = await admin.query(`select status from offers where id=$1`, [OB]);
  ok(sa.rows[0].status === "accepted", "the winning offer is accepted");
  ok(sb.rows[0].status === "sent", "the losing offer remains sent (no partial state)");

  const lu = await admin.query(`select status from listings where id=$1`, [LU]);
  const lb = await admin.query(`select status from listings where id=$1`, [LB]);
  ok(lu.rows[0].status === "active", "the unrelated listing was NOT partially reserved");
  ok(lb.rows[0].status === "active", "the losing offer's offered listing stays active");
  const rb = await admin.query(`select count(*)::int n from listing_reservations where offer_id=$1`, [OB]);
  ok(rb.rows[0].n === 0, "the losing offer created zero reservations");
}

// ---- Scenario 2: two offers sharing multiple overlapping listings --------
async function scenarioMultiOverlap(admin) {
  console.log("# Scenario 2: competing acceptances sharing two listings");
  const L1 = await mkListing(admin, seller);
  const L2 = await mkListing(admin, seller);
  const LC = await mkListing(admin, buyers[2]);
  const LD = await mkListing(admin, buyers[3]);
  const OC = await mkOffer(admin, buyers[2], [
    [LC, "offered"],
    [L1, "requested"],
    [L2, "requested"],
  ]);
  const OD = await mkOffer(admin, buyers[3], [
    [LD, "offered"],
    [L1, "requested"],
    [L2, "requested"],
  ]);

  const a = newClient();
  const b = newClient();
  await a.connect();
  await b.connect();
  let bErr = null;
  try {
    await auth(a, seller);
    await auth(b, seller);
    await a.query("begin");
    await b.query("begin");
    await a.query("select app.accept_offer($1)", [OC]);
    const bPromise = b.query("select app.accept_offer($1)", [OD]).catch((e) => {
      bErr = e;
    });
    ok(await waitForLock(admin, "accept_offer"), "the second multi-listing acceptance blocks");
    await a.query("commit");
    await bPromise;
    await b.query("rollback").catch(() => {});
  } finally {
    await a.end();
    await b.end();
  }

  ok(bErr !== null, "only one of the overlapping acceptances succeeds");
  for (const [name, id] of [
    ["L1", L1],
    ["L2", L2],
  ]) {
    const rc = await admin.query(
      `select count(*)::int n from listing_reservations where listing_id=$1 and status='active'`,
      [id],
    );
    ok(rc.rows[0].n === 1, `${name} has exactly one active reservation`);
  }
  const rc = await admin.query(`select count(*)::int n from listing_reservations where offer_id=$1`, [OD]);
  ok(rc.rows[0].n === 0, "the losing offer reserved none of the overlapping listings");
  const tc = await admin.query(`select count(*)::int n from transactions where offer_id in ($1,$2)`, [OC, OD]);
  ok(tc.rows[0].n === 1, "exactly one transaction created for the overlapping offers");
}

// ---- Scenario 3: deadlock (opposite lock acquisition order) --------------
async function scenarioDeadlock(admin) {
  console.log("# Scenario 3: deadlock detection");
  const L1 = await mkListing(admin, seller);
  const L2 = await mkListing(admin, seller);
  const LE = await mkListing(admin, buyers[4]);
  const LF = await mkListing(admin, buyers[5]);
  const OE = await mkOffer(admin, buyers[4], [
    [LE, "offered"],
    [L1, "requested"],
    [L2, "requested"],
  ]);
  const OF = await mkOffer(admin, buyers[5], [
    [LF, "offered"],
    [L1, "requested"],
    [L2, "requested"],
  ]);

  const a = newClient();
  const b = newClient();
  await a.connect();
  await b.connect();
  let aErr = null;
  let bErr = null;
  try {
    await auth(a, seller);
    await auth(b, seller);
    await a.query("begin");
    await b.query("begin");
    // Cross the lock order: A holds L1, B holds L2.
    await a.query("select id from listings where id=$1 for update", [L1]);
    await b.query("select id from listings where id=$1 for update", [L2]);
    // Each acceptance needs BOTH listings -> a lock cycle -> deadlock.
    const pa = a.query("select app.accept_offer($1)", [OE]).catch((e) => {
      aErr = e;
    });
    const pb = b.query("select app.accept_offer($1)", [OF]).catch((e) => {
      bErr = e;
    });
    await Promise.all([pa, pb]);
    await a.query("rollback").catch(() => {});
    await b.query("rollback").catch(() => {});
  } finally {
    await a.end();
    await b.end();
  }

  const deadlocks = [aErr, bErr].filter((e) => errcode(e) === "40P01").length;
  ok(deadlocks === 1, `exactly one transaction is aborted with deadlock_detected/40P01 (got ${deadlocks})`);
  // Both transactions were rolled back, so no reservations should persist.
  for (const [name, id] of [
    ["L1", L1],
    ["L2", L2],
  ]) {
    const rc = await admin.query(
      `select count(*)::int n from listing_reservations where listing_id=$1 and status='active'`,
      [id],
    );
    ok(rc.rows[0].n === 0, `${name} has no leftover reservation after the deadlock rolled back`);
  }
}

// ---- Scenario 4: two simultaneous final invitation uses ------------------
async function scenarioInvitationRace(admin) {
  console.log("# Scenario 4: concurrent final use of a shared invitation");
  const code = "CONCUR-INVITE-CODE";
  const invId = randomUUID();
  await admin.query(
    `insert into invitations (id, school_id, code_prefix, code_hash, type, max_uses, uses_count, revoked)
     values ($1,$2,left($3,9), app.hash_code($3),'shared',1,0,false)`,
    [invId, school, code],
  );
  const uP = buyers[6];
  const uQ = buyers[7];
  // These two already have verified memberships from seedBase; drop them so the
  // redeem outcome (a fresh membership) is unambiguous.
  await admin.query(`delete from school_memberships where user_id in ($1,$2)`, [uP, uQ]);

  const a = newClient();
  const b = newClient();
  await a.connect();
  await b.connect();
  let aErr = null;
  let bErr = null;
  try {
    await auth(a, uP);
    await auth(b, uQ);
    await a.query("begin");
    await b.query("begin");
    // A redeems and holds the invitation row lock (uses_count -> 1).
    await a.query("select app.redeem_invitation($1)", [code]).catch((e) => {
      aErr = e;
    });
    // B attempts the final use concurrently; blocks on the invitation row.
    const bPromise = b.query("select app.redeem_invitation($1)", [code]).catch((e) => {
      bErr = e;
    });
    ok(await waitForLock(admin, "redeem_invitation"), "the second redemption blocks on the invitation row");
    await a.query("commit");
    await bPromise;
    await b.query("rollback").catch(() => {});
  } finally {
    await a.end();
    await b.end();
  }

  ok(aErr === null, "the first redemption succeeds");
  ok(bErr !== null && errcode(bErr) === "P0001", "the second (over-limit) redemption fails with the generic error");
  const uc = await admin.query(`select uses_count from invitations where id=$1`, [invId]);
  ok(uc.rows[0].uses_count === 1, "uses_count is exactly 1 (no over-increment)");
  const mc = await admin.query(`select count(*)::int n from school_memberships where user_id in ($1,$2)`, [uP, uQ]);
  ok(mc.rows[0].n === 1, "exactly one membership was created");
  const iu = await admin.query(`select count(*)::int n from invite_code_uses where invitation_id=$1`, [invId]);
  ok(iu.rows[0].n === 1, "exactly one invite_code_uses row exists");
}

// ---- Scenario 5: concurrent admin suspension vs. self-verification --------
async function scenarioSuspendVsVerify(admin) {
  console.log("# Scenario 5: concurrent suspension vs. invitation self-verification");
  const schoolX = randomUUID();
  const adminX = randomUUID();
  const userX = randomUUID();
  const code = "SUSPEND-RACE-CODE";
  const invId = randomUUID();
  const memId = randomUUID();

  await admin.query(`insert into schools (id, name, slug, status) values ($1,'X','x-susp','active')`, [schoolX]);
  await admin.query(
    `insert into school_settings (school_id, enabled_verification_methods) values ($1, array['invite_code']::verification_method[])`,
    [schoolX],
  );
  for (const [u, name] of [
    [adminX, "Admin"],
    [userX, "User"],
  ]) {
    await admin.query(`insert into auth.users (id) values ($1)`, [u]);
    await admin.query(`insert into public.users (id, display_name) values ($1,$2)`, [u, name]);
  }
  await admin.query(`insert into school_admins (school_id, user_id, role) values ($1,$2,'school_admin')`, [schoolX, adminX]);
  // The user starts PENDING (so both transactions contend on the same row).
  await admin.query(
    `insert into school_memberships (id, school_id, user_id, status, verification_method) values ($1,$2,$3,'pending','invite_code')`,
    [memId, schoolX, userX],
  );
  await admin.query(
    `insert into invitations (id, school_id, code_prefix, code_hash, type, max_uses, uses_count) values ($1,$2,left($3,9),app.hash_code($3),'shared',10,0)`,
    [invId, schoolX, code],
  );

  const a = newClient();
  const b = newClient();
  await a.connect();
  await b.connect();
  let bErr = null;
  try {
    await auth(a, adminX);
    await auth(b, userX);
    await a.query("begin");
    await b.query("begin");
    // A suspends (locks + updates the membership row); holds the lock.
    await a.query("select public.set_membership_status($1, 'suspended', 'policy')", [memId]);
    // B attempts to self-verify; redeem locks the membership row -> blocks.
    const bPromise = b.query("select public.redeem_invitation($1)", [code]).catch((e) => {
      bErr = e;
    });
    ok(await waitForLock(admin, "redeem_invitation"), "the redemption blocks on the membership row lock");
    await a.query("commit"); // suspension commits -> B re-reads suspended
    await bPromise;
    await b.query("rollback").catch(() => {});
  } finally {
    await a.end();
    await b.end();
  }

  ok(
    bErr !== null && errcode(bErr) === "P0001" && /membership_suspended/.test(bErr.message ?? ""),
    "the concurrent self-verification loses safely with membership_suspended",
  );
  const st = await admin.query(`select status from school_memberships where id=$1`, [memId]);
  ok(st.rows[0].status === "suspended", "the membership ends deterministically suspended");
  const uc = await admin.query(`select uses_count from invitations where id=$1`, [invId]);
  ok(uc.rows[0].uses_count === 0, "the blocked redemption consumed no invitation use");
  const iu = await admin.query(`select count(*)::int n from invite_code_uses where user_id=$1`, [userX]);
  ok(iu.rows[0].n === 0, "the blocked redemption created no invite_code_uses row");
}

// ---- Scenario 6: two simultaneous final OTP verifications -----------------
async function scenarioOtpVerifyRace(admin) {
  console.log("# Scenario 6: concurrent verification of one email OTP challenge");
  const schoolY = randomUUID();
  const userY = randomUUID();
  const emailY = "otp-race@a.test";
  const code = "424242";
  const salt = "concurrency-salt";

  await admin.query(`insert into schools (id, name, slug, status) values ($1,'Y','y-otp','active')`, [schoolY]);
  await admin.query(
    `insert into school_settings (school_id, enabled_verification_methods) values ($1, array['email_otp']::verification_method[])`,
    [schoolY],
  );
  await admin.query(`insert into auth.users (id, email, email_confirmed_at) values ($1,$2, now())`, [userY, emailY]);
  await admin.query(`insert into public.users (id, display_name) values ($1,'U')`, [userY]);
  // One active challenge, correct code known. Hash matches verify_email_otp's
  // encode(sha256(salt||code)); email_hash matches app.hash_email(email).
  await admin.query(
    `insert into private.otp_challenges
       (user_id, school_id, purpose, email_normalized, email_hash, code_hash, code_salt, expires_at)
     values ($1,$2,'school_membership_verification',$3, app.hash_email($3),
             encode(sha256(convert_to($4 || $5, 'UTF8')), 'hex'), $4, now() + interval '10 minutes')`,
    [userY, schoolY, emailY, salt, code],
  );

  const a = newClient();
  const b = newClient();
  await a.connect();
  await b.connect();
  let aRes = null;
  let bRes = null;
  let aErr = null;
  let bErr = null;
  try {
    await auth(a, userY);
    await auth(b, userY);
    await a.query("begin");
    await b.query("begin");
    // A verifies and holds the challenge row lock (consumes on success).
    const ra = await a.query("select public.verify_email_otp($1,$2) as r", [schoolY, code]).catch((e) => {
      aErr = e;
      return null;
    });
    if (ra) aRes = ra.rows[0].r;
    // B verifies concurrently; it blocks on the challenge row FOR UPDATE.
    const bPromise = b
      .query("select public.verify_email_otp($1,$2) as r", [schoolY, code])
      .then((r) => {
        bRes = r.rows[0].r;
      })
      .catch((e) => {
        bErr = e;
      });
    ok(await waitForLock(admin, "verify_email_otp"), "the second verification blocks on the challenge row lock");
    await a.query("commit"); // consumption commits -> B re-reads, finds no active challenge
    await bPromise;
    await b.query("rollback").catch(() => {});
  } finally {
    await a.end();
    await b.end();
  }

  ok(aErr === null && bErr === null, "neither verification raised (result-object contract holds)");
  const aOk = aRes && aRes.ok === true;
  const bOk = bRes && bRes.ok === true;
  ok([aOk, bOk].filter(Boolean).length === 1, "exactly one verification succeeds");
  const loser = aOk ? bRes : aRes;
  ok(loser && loser.ok === false && loser.error === "otp_invalid", "the losing verification safely returns otp_invalid");

  const mc = await admin.query(
    `select count(*)::int n from school_memberships where school_id=$1 and user_id=$2 and status='verified'`,
    [schoolY, userY],
  );
  ok(mc.rows[0].n === 1, "exactly one verified membership was created (no double verification)");
  const cc = await admin.query(
    `select count(*)::int n from private.otp_challenges where user_id=$1 and consumed_at is not null`,
    [userY],
  );
  ok(cc.rows[0].n === 1, "the challenge is consumed exactly once");
}

async function main() {
  const admin = newClient();
  await admin.connect();
  try {
    await seedBase(admin);
    await scenarioSharedListing(admin);
    await scenarioMultiOverlap(admin);
    await scenarioDeadlock(admin);
    await scenarioInvitationRace(admin);
    await scenarioSuspendVsVerify(admin);
    await scenarioOtpVerifyRace(admin);
  } finally {
    await admin.end();
  }
  console.log(`1..${count}`);
  console.log(`# concurrency: ${count - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
