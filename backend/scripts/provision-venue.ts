// ============================================================
// HEP — provision a partner venue
//
// The whole Heroes-side onboarding in one command. After this runs, the
// venue administers itself through the Partner Portal and needs no
// further engineering involvement — which is the Phase 2 criterion this
// exists to make real.
//
// Usage:
//   HV_API_URL=https://pik-prd-production.up.railway.app \
//   HV_PLATFORM_ADMIN_KEY=<staff key> \
//   npx ts-node scripts/provision-venue.ts \
//     --id kingvale-keep \
//     --name "Kingvale Keep" \
//     --owner ops@kingvale.example \
//     [--scopes xp,titles,runs,rewards,guests] \
//     [--experience echoes_of_kingvale] \
//     [--no-rewards]
//
// Or, to avoid handling the key yourself:
//   railway run --environment production --service pik-prd -- \
//     npx ts-node scripts/provision-venue.ts --id … --name … --owner …
//
// ── Two things are shown ONCE and never again ──────────────────
//   • the venue API key
//   • the founding owner's invite link
// Both are stored hashed. Capture them before closing the terminal.
// ============================================================

const API = process.env.HV_API_URL?.replace(/\/$/, '');
const ADMIN_KEY = process.env.HV_PLATFORM_ADMIN_KEY;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

const ID = arg('--id');
const NAME = arg('--name');
const OWNER = arg('--owner');
const EXPERIENCE = arg('--experience') ?? 'echoes_of_kingvale';

// A pilot that should run but not yet pay: licensed for everything
// except `rewards`. Useful for a rehearsal night before going live.
const SCOPES = (arg('--scopes') ?? 'xp,titles,runs,rewards,guests')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((s) => (has('--no-rewards') ? s !== 'rewards' : true));

if (!API || !ADMIN_KEY || !ID || !NAME || !OWNER) {
  console.error(
    'Missing required input.\n' +
      '  env : HV_API_URL, HV_PLATFORM_ADMIN_KEY\n' +
      '  args: --id <source_id> --name "<Venue Name>" --owner <email>\n' +
      '  opt : --scopes a,b,c  --experience <slug>  --no-rewards',
  );
  process.exit(2);
}

async function call(path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-HV-Admin-Key': ADMIN_KEY! },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json?.data ?? json };
}

function die(step: string, detail: unknown): never {
  console.error(`\n✗ ${step}`);
  console.error(JSON.stringify(detail, null, 2));
  console.error(
    '\nNothing was rolled back — re-running is safe for steps that already ' +
      'succeeded, except source creation (which will report a conflict).',
  );
  process.exit(1);
}

async function main() {
  console.log(`\nProvisioning "${NAME}" (${ID}) on ${API}\n`);

  // 1 — the venue itself
  const created = await call('/api/sources', { source_id: ID, source_name: NAME });
  if (created.status >= 400) die('create venue', created.body);
  const apiKey = created.body?.api_key;
  console.log('1. Venue created');

  // 2 — what it is licensed to do
  const scoped = await call(`/api/sources/${ID}/scopes`, { scopes: SCOPES });
  if (scoped.status >= 400) die('set scopes', scoped.body);
  console.log(`2. Scopes granted            ${SCOPES.join(' ')}`);
  if (!SCOPES.includes('rewards')) {
    console.log('   ⚠ NO `rewards` scope — runs will settle but pay nothing.');
  }

  // 3 — what content it may run
  const assigned = await call(`/api/sources/${ID}/experiences`, {
    experience_slug: EXPERIENCE,
    enabled: true,
  });
  if (assigned.status >= 400) die('assign experience', assigned.body);
  console.log(`3. Experience assigned       ${EXPERIENCE}`);

  // 4 — the founding owner; every later account comes from them
  const invited = await call(`/api/sources/${ID}/staff`, {
    email: OWNER,
    role: 'owner',
  });
  if (invited.status >= 400) die('invite owner', invited.body);
  console.log(`4. Owner invited             ${OWNER}`);

  const portal = `${API}/venue.html`;

  console.log('\n' + '─'.repeat(68));
  console.log('SHOWN ONCE — capture these now. Both are stored hashed.');
  console.log('─'.repeat(68));
  console.log(`\nVenue API key (for their hardware, X-PIK-API-Key):\n  ${apiKey}`);
  console.log(`\nOwner invite link (send to ${OWNER}):\n  ${portal}#accept=${invited.body?.invite_token}`);
  console.log(`\n  Expires ${invited.body?.invite_expires ?? 'in 14 days'}.`);
  console.log('\n' + '─'.repeat(68));
  console.log(`
Hand the partner:
  • the integration guide (docs/hep/partner-integration-guide.md)
  • their API key, for their runtime
  • the invite link, for their owner

They then sign in at ${portal}, invite their own staff, print the
check-in QR from the portal, and start running. No further Heroes
involvement is required.
`);
}

main().catch((e) => {
  console.error('\nProvisioning crashed:', e);
  process.exit(1);
});
