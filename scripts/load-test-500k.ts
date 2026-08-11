import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const sql = postgres(url, { max: 2 });
const args = new Set(process.argv.slice(2));
const slug = 'enterprise-load-test-500k';

try {
  if (args.has('--cleanup')) {
    await sql`delete from tenants where slug = ${slug}`;
    console.log('Load-test tenant removed');
    process.exit(0);
  }
  let [tenant] = await sql`select id from tenants where slug = ${slug}`;
  if (args.has('--seed')) {
    if (!tenant) {
      [tenant] = await sql`insert into tenants (name, slug, max_active_users) values ('Enterprise load test', ${slug}, 100) returning id`;
    }
    await sql`
      insert into consumers (tenant_id, first_name, last_name, email, phone, created_at)
      select ${tenant.id}, 'Contact', n::text, 'contact-' || n || '@example.test', '+1914' || lpad(n::text, 7, '0'), now()
      from generate_series(1, 500000) n
      on conflict do nothing
    `;
  }
  [tenant] = await sql`select id from tenants where slug = ${slug}`;
  if (!tenant) throw new Error('Run with --seed first');
  const [{ count }] = await sql`select count(*)::int count from consumers where tenant_id = ${tenant.id}`;
  if (count !== 500000) throw new Error(`Expected 500000 contacts; found ${count}`);

  const first = await sql`select id, email from consumers where tenant_id = ${tenant.id} order by id limit 500`;
  const next = await sql`select id, email from consumers where tenant_id = ${tenant.id} and id > ${first[499].id} order by id limit 500`;
  const searchPlan = await sql`explain (analyze, buffers, format text) select id from consumers where tenant_id = ${tenant.id} and lower(email) = 'contact-250000@example.test' limit 1`;
  if (first.length > 500 || next.length > 500) throw new Error('Page exceeded the 500-row bound');
  console.log({ contacts: count, firstPage: first.length, cursorPage: next.length });
  console.log(searchPlan.map(row => row['QUERY PLAN']).join('\n'));
} finally {
  await sql.end();
}
