// ============================================================
// PIK — Database Seed Script
// Replaces db/seed.py from the Python MVP
//
// Creates all reference data: config, titles, sources, and
// demo users with source links. Safe to re-run (uses upsert).
//
// Run with: npx prisma db seed
// Or directly: npx ts-node prisma/seed.ts
//
// Place at: prisma/seed.ts
// ============================================================

import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function main() {
  console.log('');
  console.log('PIK Seed → PostgreSQL');
  console.log('');

  // ── 1. Config values (same 11 keys as Python MVP) ────────

  const configs = [
    { key: 'fate.xp_per_session_normal', value: '100', description: 'Base Fate XP for a normal session completion' },
    { key: 'fate.xp_per_session_hard', value: '150', description: 'Base Fate XP for a hard session completion' },
    { key: 'fate.xp_level_multiplier', value: '1.2', description: 'XP threshold multiplier per level' },
    { key: 'fate.xp_base_threshold', value: '200', description: 'XP required to reach Fate Level 2' },
    { key: 'fate.xp_node_completion', value: '15', description: 'Fate XP per completed node' },
    { key: 'fate.xp_boss_tier_pct', value: '0.5', description: 'Boss damage pct bonus multiplier on session XP' },
    { key: 'fate.event_xp_multiplier', value: '1.0', description: 'Live-event XP multiplier (operator-tunable)' },
    { key: 'pik.api_port', value: '8080', description: 'PIK REST API port' },
    { key: 'pik.dashboard_port', value: '8090', description: 'PIK Dashboard port (informational)' },
    { key: 'pik.default_link_scope', value: 'xp fate_markers titles', description: 'Default consent scope for new source links' },
    { key: 'pik.session_token_ttl_secs', value: '3600', description: 'Auth session token TTL in seconds' },
  ];

  for (const c of configs) {
    await prisma.config.upsert({
      where: { key: c.key },
      update: {},
      create: c,
    });
  }
  console.log(`[1/5] Config → ${configs.length} rows`);

  // ── 2. Reference titles (same 10 titles as Python MVP) ────

  const titles = [
    { id: 'title_fate_awakened', displayName: 'FATE AWAKENED', category: 'fate', description: 'Reached Fate Level 2' },
    { id: 'title_fate_burning', displayName: 'FATE BURNING', category: 'fate', description: 'Reached Fate Level 5' },
    { id: 'title_fate_ascendant', displayName: 'FATE ASCENDANT', category: 'fate', description: 'Reached Fate Level 10' },
    { id: 'title_veilbreaker_50', displayName: 'VEIL TOUCHED', category: 'boss', description: '50%+ boss damage in a single session' },
    { id: 'title_veilbreaker_75', displayName: 'VEIL SLAYER', category: 'boss', description: '75%+ boss damage in a single session' },
    { id: 'title_veilbreaker_100', displayName: 'VEIL SHATTERER', category: 'boss', description: '100% boss damage in a single session' },
    { id: 'title_first_session', displayName: 'INITIATED', category: 'session', description: 'Completed first session' },
    { id: 'title_five_sessions', displayName: 'PROVEN', category: 'session', description: 'Completed 5 sessions' },
    { id: 'title_node_master', displayName: 'NODE MASTER', category: 'session', description: 'Completed all nodes in a session' },
    { id: 'title_multi_source', displayName: 'REALM WALKER', category: 'meta', description: 'Progressed from 2+ sources' },
  ];

  for (const t of titles) {
    await prisma.title.upsert({
      where: { id: t.id },
      update: {},
      create: t,
    });
  }
  console.log(`[2/5] Titles → ${titles.length} rows`);

  // ── 3. Sources + demo API keys ────────────────────────────

  const hvKey = 'hv-demo-api-key-2025';
  const mockKey = 'mock-venue-api-key-2025';

  await prisma.source.upsert({
    where: { id: 'src-heroes-veritas-01' },
    update: {},
    create: {
      id: 'src-heroes-veritas-01',
      name: "Heroes' Veritas — Venue 01",
      apiKeyHash: hashKey(hvKey),
    },
  });

  await prisma.source.upsert({
    where: { id: 'src-mock-venue-01' },
    update: {},
    create: {
      id: 'src-mock-venue-01',
      name: 'Mock Partner Venue',
      apiKeyHash: hashKey(mockKey),
    },
  });

  console.log('[3/5] Sources → 2 rows');
  console.log('┌─ API Keys (save these — not stored in plain text) ────────');
  console.log(`│ Heroes' Veritas key : ${hvKey}`);
  console.log(`│ Mock Venue key      : ${mockKey}`);
  console.log('└─────────────────────────────────────────────────');

  // ── 4. Demo users ─────────────────────────────────────────

  const demo1 = await prisma.rootIdentity.upsert({
    where: { id: 'pik-root-demo-operator-001' },
    update: {},
    create: {
      id: 'pik-root-demo-operator-001',
      heroName: 'Aelindra Voss',
      fateAlignment: 'Order',
      origin: 'Tower Sentinel',
      enrolledBy: 'operator:demo',
    },
  });

  const demo2 = await prisma.rootIdentity.upsert({
    where: { id: 'pik-root-demo-self-001' },
    update: {},
    create: {
      id: 'pik-root-demo-self-001',
      heroName: 'Korrath the Grey',
      fateAlignment: 'Chaos',
      origin: 'Ashlands Wanderer',
      enrolledBy: 'self',
    },
  });

  // Personas
  await prisma.persona.upsert({
    where: { id: 'persona-demo-operator-001' },
    update: {},
    create: {
      id: 'persona-demo-operator-001',
      rootId: demo1.id,
      displayName: 'Aelindra Voss',
    },
  });

  await prisma.persona.upsert({
    where: { id: 'persona-demo-self-001' },
    update: {},
    create: {
      id: 'persona-demo-self-001',
      rootId: demo2.id,
      displayName: 'Korrath the Grey',
    },
  });

  console.log('[4/5] Demo users → 2 rows');

  // ── 5. Source links for demo users ────────────────────────

  // Aelindra → HV
  await prisma.sourceLink.upsert({
    where: { id: 'link-demo-op-hv' },
    update: {},
    create: {
      id: 'link-demo-op-hv',
      rootId: demo1.id,
      sourceId: 'src-heroes-veritas-01',
      grantedBy: 'operator:demo',
    },
  });

  // Korrath → HV
  await prisma.sourceLink.upsert({
    where: { id: 'link-demo-self-hv' },
    update: {},
    create: {
      id: 'link-demo-self-hv',
      rootId: demo2.id,
      sourceId: 'src-heroes-veritas-01',
      grantedBy: 'self',
    },
  });

  // Korrath → Mock Venue
  await prisma.sourceLink.upsert({
    where: { id: 'link-demo-self-mock' },
    update: {},
    create: {
      id: 'link-demo-self-mock',
      rootId: demo2.id,
      sourceId: 'src-mock-venue-01',
      grantedBy: 'self',
    },
  });

  console.log('[5/5] Source links → 3 rows');

  // ── Enrollment events ─────────────────────────────────────
  // Use createMany with skipDuplicates so re-runs are safe.

  await prisma.identityEvent.createMany({
    data: [
      {
        rootId: demo1.id,
        eventType: 'identity.enrolled',
        payload: { enrolled_by: 'operator:demo', hero_name: 'Aelindra Voss' },
      },
      {
        rootId: demo2.id,
        eventType: 'identity.enrolled',
        payload: { enrolled_by: 'self', hero_name: 'Korrath the Grey' },
      },
      {
        rootId: demo1.id,
        eventType: 'source.link_granted',
        sourceId: 'src-heroes-veritas-01',
        payload: { link_id: 'link-demo-op-hv', source_id: 'src-heroes-veritas-01', granted_by: 'operator:demo' },
      },
      {
        rootId: demo2.id,
        eventType: 'source.link_granted',
        sourceId: 'src-heroes-veritas-01',
        payload: { link_id: 'link-demo-self-hv', source_id: 'src-heroes-veritas-01', granted_by: 'self' },
      },
      {
        rootId: demo2.id,
        eventType: 'source.link_granted',
        sourceId: 'src-mock-venue-01',
        payload: { link_id: 'link-demo-self-mock', source_id: 'src-mock-venue-01', granted_by: 'self' },
      },
    ],
    skipDuplicates: true,
  });

  console.log('');
  console.log('=== SEED COMPLETE ===');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
