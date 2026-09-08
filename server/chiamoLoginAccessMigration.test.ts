import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "./db";
import { migrateChiamoLoginAccess } from "./chiamoLoginAccessMigration";

after(async () => { await pool.end(); });

test("legacy login policy preserves restrictions, allows provider-only failures, and never reapplies after admin resolution", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // A connection-local temporary table shadows the real table. All writes
    // below are rolled back; no customer or provider data is touched.
    await client.query(`CREATE TEMP TABLE chiamo_service_configurations (
      id TEXT, customer_login_enabled BOOLEAN, explicit_login_disabled BOOLEAN DEFAULT FALSE,
      account_active BOOLEAN, postmark_status TEXT
    ) ON COMMIT DROP`);
    await client.query(`INSERT INTO chiamo_service_configurations
      (id, customer_login_enabled, explicit_login_disabled, account_active, postmark_status) VALUES
      ('deliberate', FALSE, FALSE, TRUE, 'READY'),
      ('ambiguous', FALSE, FALSE, TRUE, 'FAILED'),
      ('provider-only', TRUE, FALSE, TRUE, 'FAILED'),
      ('already-explicit', TRUE, TRUE, TRUE, 'READY')`);
    await migrateChiamoLoginAccess(client);
    const initial = await client.query(`SELECT id, explicit_login_disabled AS disabled FROM chiamo_service_configurations ORDER BY id`);
    assert.deepEqual(initial.rows, [
      { id: "already-explicit", disabled: true },
      { id: "ambiguous", disabled: true },
      { id: "deliberate", disabled: true },
      { id: "provider-only", disabled: false },
    ]);
    await client.query(`UPDATE chiamo_service_configurations SET customer_login_enabled = TRUE,
      explicit_login_disabled = FALSE WHERE id = 'ambiguous'`);
    // Retry synchronizes only the compatibility flag from the enforced flag.
    await client.query(`UPDATE chiamo_service_configurations SET customer_login_enabled = NOT explicit_login_disabled`);
    await migrateChiamoLoginAccess(client);
    const again = await client.query(`SELECT id, explicit_login_disabled AS disabled FROM chiamo_service_configurations ORDER BY id`);
    assert.deepEqual(again.rows, [
      { id: "already-explicit", disabled: true },
      { id: "ambiguous", disabled: false },
      { id: "deliberate", disabled: true },
      { id: "provider-only", disabled: false },
    ]);
    await client.query(`INSERT INTO chiamo_service_configurations(id, customer_login_enabled) VALUES ('new', TRUE)`);
    const fresh = await client.query(`SELECT login_access_policy_version AS version FROM chiamo_service_configurations WHERE id = 'new'`);
    assert.equal(fresh.rows[0].version, 1);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});