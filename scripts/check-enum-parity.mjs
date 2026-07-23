// TypeScript <-> database enum parity check.
//
// Imports the enum single source of truth (packages/types/src/enums.ts) and
// compares each array, in order, against the corresponding Postgres enum type.
// Also checks the prohibited_categories reference table. Exits non-zero on any
// drift. Run with:  node --experimental-strip-types scripts/check-enum-parity.mjs
//
// Requires a database with the schema applied (SWAP_ENUM_DB / PGDATABASE).

import pg from "pg";
import * as enums from "../packages/types/src/enums.ts";

const HOST = process.env.PGHOST || "/var/run/postgresql";
const USER = process.env.PGUSER || "root";
const DB = process.env.SWAP_ENUM_DB || process.env.PGDATABASE || "swap_dev";

// TS export name -> Postgres enum type name.
const ENUM_MAP = {
  SCHOOL_STATUS: "school_status",
  MEMBERSHIP_STATUS: "membership_status",
  MEMBERSHIP_REQUEST_STATUS: "membership_request_status",
  VERIFICATION_METHOD: "verification_method",
  SCHOOL_ROLE: "school_role",
  PLATFORM_ROLE: "platform_role",
  LISTING_POST_TYPE: "listing_post_type",
  LISTING_STATUS: "listing_status",
  ITEM_CONDITION: "item_condition",
  RESERVATION_STATUS: "reservation_status",
  OFFER_STATUS: "offer_status",
  OFFER_ITEM_DIRECTION: "offer_item_direction",
  TRANSACTION_STATUS: "transaction_status",
  CONVERSATION_CONTEXT: "conversation_context",
  COMMUNITY_POST_TYPE: "community_post_type",
  COMMUNITY_POST_STATUS: "community_post_status",
  EVENT_STATUS: "event_status",
  EVENT_APPROVAL_POLICY: "event_approval_policy",
  REPORT_TARGET_TYPE: "report_target_type",
  REPORT_REASON: "report_reason",
  REPORT_STATUS: "report_status",
  MODERATION_ACTION_TYPE: "moderation_action_type",
  NOTIFICATION_TYPE: "notification_type",
  DEVICE_PLATFORM: "device_platform",
  INVITATION_TYPE: "invitation_type",
  ACCOUNT_STATUS: "account_status",
};

let checks = 0;
let failures = 0;
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const report = (name, ok, detail) => {
  checks += 1;
  if (ok) {
    console.log(`ok - ${name}`);
  } else {
    failures += 1;
    console.log(`NOT OK - ${name}\n    ${detail}`);
  }
};

async function main() {
  const client = new pg.Client({ host: HOST, user: USER, database: DB });
  await client.connect();
  try {
    for (const [tsName, pgType] of Object.entries(ENUM_MAP)) {
      const tsValues = enums[tsName];
      if (!Array.isArray(tsValues)) {
        report(`${tsName} (${pgType})`, false, `TS export ${tsName} is missing or not an array`);
        continue;
      }
      const { rows } = await client.query(
        `select e.enumlabel as label
           from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = $1
          order by e.enumsortorder`,
        [pgType],
      );
      const dbValues = rows.map((r) => r.label);
      report(
        `${tsName} == ${pgType}`,
        eq([...tsValues], dbValues),
        `TS=[${tsValues.join(",")}]  DB=[${dbValues.join(",")}]`,
      );
    }

    // prohibited_categories reference table vs PROHIBITED_CATEGORIES.
    const { rows } = await client.query(`select category from prohibited_categories order by category`);
    const dbCats = rows.map((r) => r.category);
    const tsCats = [...enums.PROHIBITED_CATEGORIES].sort();
    report(
      "PROHIBITED_CATEGORIES == prohibited_categories table",
      eq(tsCats, dbCats),
      `TS=[${tsCats.join(",")}]  DB=[${dbCats.join(",")}]`,
    );
  } finally {
    await client.end();
  }

  console.log(`\n# enum parity: ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
