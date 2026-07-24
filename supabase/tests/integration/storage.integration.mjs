// Real Supabase Storage integration test.
//
// Runs against a DISPOSABLE local Supabase stack (`supabase start`) — the actual
// Storage service and storage schema, with all migrations applied from clean.
// It creates only synthetic users/schools/objects. It never touches production
// and needs no production secrets (the CLI mints throwaway local keys).
//
// Env (from `supabase status`): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.
//
// Proves the 11 Storage authorization requirements (see docs/storage.md).

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "Password123!";
const BUCKET = "listing-images";

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

const jpeg = (bytes = 64) => Buffer.alloc(bytes, 1);

async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}
const userClient = (token) =>
  createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });

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
  return { id, client: userClient(await signIn(email)) };
}

async function existsViaService(path) {
  const { data, error } = await svc.storage.from(BUCKET).download(path);
  return !!data && !error;
}

async function main() {
  // -------- synthetic fixtures --------
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  const listingA = randomUUID();
  const listingB = randomUUID();
  const tag = randomUUID().slice(0, 8);

  must("schoolA", await svc.from("schools").insert({ id: schoolA, name: "A", slug: `a-${tag}`, status: "active" }));
  must("schoolB", await svc.from("schools").insert({ id: schoolB, name: "B", slug: `b-${tag}`, status: "active" }));

  const memberA = await makeUser({ email: `a-${tag}@example.test`, schoolId: schoolA, status: "verified" });
  const memberA2 = await makeUser({ email: `a2-${tag}@example.test`, schoolId: schoolA, status: "verified" });
  const moderatorA = await makeUser({ email: `mod-${tag}@example.test`, schoolId: schoolA, role: "school_moderator" });
  const suspendedA = await makeUser({ email: `susp-${tag}@example.test`, schoolId: schoolA, status: "suspended" });
  const memberB = await makeUser({ email: `b-${tag}@example.test`, schoolId: schoolB, status: "verified" });

  must("listingA", await svc.from("listings").insert({ id: listingA, school_id: schoolA, owner_id: memberA.id, post_type: "give", title: "A", description: "d", category: "other" }));
  must("listingB", await svc.from("listings").insert({ id: listingB, school_id: schoolB, owner_id: memberB.id, post_type: "give", title: "B", description: "d", category: "other" }));

  const aPath = `${schoolA}/${listingA}/a.jpg`;
  const bPath = `${schoolB}/${listingB}/b.jpg`;
  // A private School B object, created out-of-band by the service role.
  must("seed B object", await svc.storage.from(BUCKET).upload(bPath, jpeg(), { contentType: "image/jpeg" }));

  // 1. verified School A member uploads to an authorized School A path
  {
    const { error } = await memberA.client.storage.from(BUCKET).upload(aPath, jpeg(), { contentType: "image/jpeg" });
    ok(!error, "verified School A member can upload to their School A listing path");
  }

  // 2. School A member cannot upload to a School B path
  {
    const { error } = await memberA.client.storage
      .from(BUCKET)
      .upload(`${schoolB}/${listingB}/hack.jpg`, jpeg(), { contentType: "image/jpeg" });
    ok(!!error, "School A member cannot upload to a School B path");
  }

  // 3. School A member cannot read a private School B object
  {
    const { data, error } = await memberA.client.storage.from(BUCKET).download(bPath);
    ok(!!error && !data, "School A member cannot download a private School B object");
  }

  // 11. Signed URLs do not expose unauthorized private objects
  {
    const { data, error } = await memberA.client.storage.from(BUCKET).createSignedUrl(bPath, 60);
    ok(!!error && !data?.signedUrl, "School A member cannot create a signed URL for a School B object");
  }

  // 5. Another regular student cannot delete the owner's object (test before 4)
  {
    await memberA2.client.storage.from(BUCKET).remove([aPath]);
    ok(await existsViaService(aPath), "another regular student cannot delete the owner's object");
  }

  // 6. An authorized School A moderator can remove a School A object (permitted moderation)
  {
    await moderatorA.client.storage.from(BUCKET).remove([aPath]);
    ok(!(await existsViaService(aPath)), "a School A moderator can remove a School A object");
  }

  // 4. The listing owner can delete their own object
  {
    const reAdd = `${schoolA}/${listingA}/again.jpg`;
    must("owner re-upload", await memberA.client.storage.from(BUCKET).upload(reAdd, jpeg(), { contentType: "image/jpeg" }));
    await memberA.client.storage.from(BUCKET).remove([reAdd]);
    ok(!(await existsViaService(reAdd)), "the listing owner can delete their own object");
  }

  // 7. A School A moderator cannot administer School B storage
  {
    await moderatorA.client.storage.from(BUCKET).remove([bPath]);
    ok(await existsViaService(bPath), "a School A moderator cannot delete a School B object");
  }

  // 8. A suspended member loses access
  {
    const { error } = await suspendedA.client.storage
      .from(BUCKET)
      .upload(`${schoolA}/${listingA}/susp.jpg`, jpeg(), { contentType: "image/jpeg" });
    ok(!!error, "a suspended member cannot upload");
  }

  // 9. Malformed / manipulated paths cannot bypass tenant isolation
  {
    const noFolder = await memberA.client.storage.from(BUCKET).upload("nofolder.jpg", jpeg(), { contentType: "image/jpeg" });
    ok(!!noFolder.error, "a path with no folder cannot bypass school extraction");
    const notUuid = await memberA.client.storage
      .from(BUCKET)
      .upload(`not-a-uuid/${listingA}/x.jpg`, jpeg(), { contentType: "image/jpeg" });
    ok(!!notUuid.error, "a non-UUID first segment cannot bypass school extraction");
    const foreign = await memberA.client.storage
      .from(BUCKET)
      .upload(`${schoolB}/${listingA}/x.jpg`, jpeg(), { contentType: "image/jpeg" });
    ok(!!foreign.error, "spoofing another school's folder is rejected");
  }

  // 10. MIME-type and file-size restrictions are enforced at the Storage service level
  {
    const badMime = await memberA.client.storage
      .from(BUCKET)
      .upload(`${schoolA}/${listingA}/note.txt`, Buffer.from("hello"), { contentType: "text/plain" });
    ok(!!badMime.error, "a disallowed MIME type is rejected by the Storage service");
    const tooBig = await memberA.client.storage
      .from(BUCKET)
      .upload(`${schoolA}/${listingA}/big.jpg`, jpeg(6 * 1024 * 1024), { contentType: "image/jpeg" });
    ok(!!tooBig.error, "an oversized file is rejected by the Storage service");
  }

  console.log(`1..${n}`);
  console.log(`# storage integration: ${n - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
