// ============================================================
// PIK — Doctrine Catalog (canon §13.5)
//
// DATA, not schema. New doctrine definitions ship by editing this
// file — no DB migration (canon §13.5 LiveOps rule). Player branch
// *selections* live in the `doctrines` JSON column; core nodes are
// implicit from Job Level.
//
// Per Job: six CORE nodes (one per rank, auto-unlock by Job Level)
// and three BRANCH milestones (choose 1 of 2) between the ranks.
// Each node grants Resonance (feeds the additive layer, §13.2) and
// carries a one-line mechanic descriptor. The structured combat
// EFFECTS are Phase 4b — for now nodes contribute Resonance + story.
//
// First-pass content — names/descriptions are tunable; the STRUCTURE
// (rank-gated cores + milestone branches) is the canon part.
// ============================================================

export type DoctrineKind = 'core' | 'branch';

export interface DoctrineNode {
  id:        string;        // stable, e.g. 'aegis_core_10', 'aegis_b15_a'
  job:       string;        // AEGIS | SCALESWORN | DRYADIC | HARVESTER
  jobLevel:  number;        // Job Level gate
  kind:      DoctrineKind;
  group?:    string;        // branch milestone id — options in a group are exclusive
  name:      string;
  desc:      string;        // the mechanic it modifies (never replaces an ability)
  resonance: number;        // additive Resonance grant (§13.2)
}

const CORE_RES   = 6;
const BRANCH_RES = 5;
// Cores land one per rank; branches interleave between them.
const CORE_LEVELS   = [1, 10, 20, 30, 40, 50];
const BRANCH_LEVELS = [15, 25, 35];

interface JobDoctrineSpec {
  cores:    string[];                                  // 6, aligned to CORE_LEVELS
  branches: Array<[[string, string], [string, string]]>; // 3 groups × 2 [name, desc]
}

const SPECS: Record<string, JobDoctrineSpec> = {
  AEGIS: {
    cores: ['Iron Stance', 'Shield Discipline', 'Aegis Wall', 'Unbroken Line', 'Living Rampart', 'The Eternal Aegis'],
    branches: [
      [['Riposte Form', 'Counters strike back harder'], ['Fortress Form', 'Perfect reads knit more stability']],
      [['Bulwark Oath', 'The read window opens wider'], ['Sentinel Oath', 'Resonance gathers faster']],
      [['Immovable', 'A misread costs less stability'], ['Bastion', 'A sealed rift yields more shards']],
    ],
  },
  SCALESWORN: {
    cores: ['Scaled Edge', 'Emberscale', 'Wyrmstrike', "Dragon's Wrath", 'Cataclysm Scale', 'The Elder Wyrm'],
    branches: [
      [['Rending Doctrine', 'Strikes crit more often'], ['Searing Doctrine', 'Crits bite deeper']],
      [["Predator's Focus", 'Resonance gathers faster'], ['Savage Momentum', 'Counters deal bonus damage']],
      [['Apex', 'Crit chance climbs again'], ['Onslaught', 'Every strike hits harder']],
    ],
  },
  DRYADIC: {
    cores: ['Rootbond', 'Verdant Grace', 'Thornward', 'Bloomsurge', 'Ancient Grove', 'The World Tree'],
    branches: [
      [['Renewal', 'Perfect reads heal more'], ['Bramble', 'Counters entangle for bonus damage']],
      [['Photosynthesis', 'Resonance gathers faster'], ['Deeproot', 'The read window opens wider']],
      [['Evergreen', 'Stability recovers each act'], ['Wildgrowth', 'A sealed rift yields more shards']],
    ],
  },
  HARVESTER: {
    cores: ['Cull', "Gleaner's Eye", "Reaper's Toll", 'Soul Harvest', 'Dread Sickle', 'The Final Reaping'],
    branches: [
      [['Fortune', 'Loot luck rises'], ['Scavenger', 'A sealed rift yields more shards']],
      [['Deathbind', 'Strikes gain a crit chance'], ['Grave Momentum', 'Resonance gathers faster']],
      [['Abundance', 'Shard yield climbs again'], ['Windfall', 'Loot luck rises further']],
    ],
  },
};

function buildJob(job: string, spec: JobDoctrineSpec): DoctrineNode[] {
  const key = job.toLowerCase();
  const nodes: DoctrineNode[] = [];
  spec.cores.forEach((name, i) => {
    const jobLevel = CORE_LEVELS[i];
    nodes.push({ id: `${key}_core_${jobLevel}`, job, jobLevel, kind: 'core', name, desc: 'Core discipline of the path.', resonance: CORE_RES });
  });
  spec.branches.forEach((opts, i) => {
    const jobLevel = BRANCH_LEVELS[i];
    const group = `${key}_m${jobLevel}`;
    ['a', 'b'].forEach((sfx, oi) => {
      const [name, desc] = opts[oi];
      nodes.push({ id: `${key}_b${jobLevel}_${sfx}`, job, jobLevel, kind: 'branch', group, name, desc, resonance: BRANCH_RES });
    });
  });
  return nodes;
}

export const DOCTRINE_CATALOG: DoctrineNode[] = Object.entries(SPECS)
  .flatMap(([job, spec]) => buildJob(job, spec));

export function catalogForJob(job: string | null | undefined): DoctrineNode[] {
  if (!job) return [];
  return DOCTRINE_CATALOG.filter(n => n.job === job);
}

export function doctrineById(id: string): DoctrineNode | undefined {
  return DOCTRINE_CATALOG.find(n => n.id === id);
}
