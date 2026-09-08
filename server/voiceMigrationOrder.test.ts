import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

test('inbound recording context migration follows routing tables and runtime bootstrap has no forward routing FK', () => {
  const migrations = fs.readdirSync(path.resolve('migrations')).sort();
  assert.ok(migrations.indexOf('20260827030000_inbound_voice_recording_context.sql')
    > migrations.indexOf('20260827020000_shared_voice_routing_voicemail.sql'));

  const sql = fs.readFileSync(path.resolve('migrations/20260827030000_inbound_voice_recording_context.sql'), 'utf8');
  assert.match(sql, /inbound_phone_number_id UUID REFERENCES voip_phone_numbers/i);
  assert.match(sql, /inbound_routing_bucket_id UUID REFERENCES voip_routing_buckets/i);
  assert.match(sql, /is_privacy_inbound BOOLEAN NOT NULL DEFAULT false/i);
  assert.match(sql, /voip_call_logs_tenant_call_sid_idx/i);

  const runtime = fs.readFileSync(path.resolve('server/migrations.ts'), 'utf8');
  const earlyCallLogCreate = runtime.slice(
    runtime.indexOf('CREATE TABLE IF NOT EXISTS voip_call_logs'),
    runtime.indexOf('// Add payment_frequency column'),
  );
  assert.doesNotMatch(earlyCallLogCreate, /inbound_routing_bucket_id|voip_routing_buckets/);
});