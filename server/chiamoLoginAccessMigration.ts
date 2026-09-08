export const LEGACY_CHIAMO_LOGIN_DISABLED_SQL =
  "(COALESCE(explicit_login_disabled, FALSE) OR customer_login_enabled IS NOT TRUE)";

/**
 * A legacy false value may be an intentional admin disable OR incomplete
 * invitation delivery. Historical records cannot prove which. Preserve it and
 * require a deliberate admin enable; never infer authorization from a provider.
 * The version marker prevents later startups from undoing that admin decision.
 */
export async function migrateChiamoLoginAccess(client: { query: (sql: string) => Promise<unknown> }) {
  await client.query(`
    ALTER TABLE chiamo_service_configurations
      ADD COLUMN IF NOT EXISTS explicit_login_disabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS login_access_policy_version INTEGER NOT NULL DEFAULT 0
  `);
  await client.query(`
    UPDATE chiamo_service_configurations
    SET explicit_login_disabled = ${LEGACY_CHIAMO_LOGIN_DISABLED_SQL},
        login_access_policy_version = 1
    WHERE login_access_policy_version = 0
  `);
  await client.query(`
    ALTER TABLE chiamo_service_configurations ALTER COLUMN login_access_policy_version SET DEFAULT 1
  `);
}