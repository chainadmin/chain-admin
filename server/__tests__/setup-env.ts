if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
}

if (!process.env.POSTMARK_ACCOUNT_TOKEN) {
  process.env.POSTMARK_ACCOUNT_TOKEN = 'test-postmark-account-token';
}

if (!process.env.POSTMARK_SERVER_TOKEN) {
  process.env.POSTMARK_SERVER_TOKEN = 'test-postmark-server-token';
}

if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-supabase-service-role-key';
}

process.env.SUPABASE_SKIP_INIT = '1';
process.env.SUPPRESS_DB_CONNECTION = '1';

