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
// Cores grant Resonance (the additive layer, §13.2). Branches grant
// Resonance AND a structured combat EFFECT (Phase 4b) that funnels
// into the same battle dials as the paradigm perks — crit, read
// window, resonance-gain, stability heal, shard luck, counter power.
// Doctrines modify mechanics; they never replace an ability.
//
// First-pass content — names/magnitudes are tunable; the STRUCTURE
// is the canon part.
// ============================================================

export type DoctrineKind = 'core' | 'branch';

/** Structured combat effect (Phase 4b). Keys match battle
 *  calibration dials; values stack additively on paradigm perks.
 *  Percent dials: crit / window / resGain / shardLuck / counter.
 *  Flat: stability (HP per perfect read). */
export interface DoctrineEffect {
  crit?:      number;   // + crit chance (percentage points)
  window?:    number;   // + read-window width (percent)
  resGain?:   number;   // + resonance-meter gain (percent)
  stability?: number;   // + HP on a perfect read (flat)
  shardLuck?: number;   // + shard reward (percent)
  counter?:   number;   // + counter damage (percent)
}

export interface DoctrineNode {
  id:        string;        // stable, e.g. 'aegis_core_10', 'aegis_b15_a'
  job:       string;        // AEGIS | SCALESWORN | DRYADIC | HARVESTER
  jobLevel:  number;        // Job Level gate
  kind:      DoctrineKind;
  group?:    string;        // branch milestone id — options in a group are exclusive
  name:      string;
  desc:      string;        // the mechanic it modifies (never replaces an ability)
  resonance: number;        // additive Resonance grant (§13.2)
  effects?:  DoctrineEffect; // branch nodes only (Phase 4b)
}

const CORE_RES   = 6;
const BRANCH_RES = 5;
// Cores land one per rank; branches interleave between them.
const CORE_LEVELS   = [1, 10, 20, 30, 40, 50];
const BRANCH_LEVELS = [15, 25, 35];

interface BranchOpt { name: string; desc: string; effect: DoctrineEffect; }
interface JobDoctrineSpec {
  cores:    string[];                            // 6, aligned to CORE_LEVELS
  branches: Array<[BranchOpt, BranchOpt]>;       // 3 groups × 2 options
}

const SPECS: Record<string, JobDoctrineSpec> = {
  AEGIS: {
    cores: ['Iron Stance', 'Shield Discipline', 'Aegis Wall', 'Unbroken Line', 'Living Rampart', 'The Eternal Aegis'],
    branches: [
      [{ name: 'Riposte Form', desc: 'Counters strike back harder', effect: { counter: 15 } },
       { name: 'Fortress Form', desc: 'Perfect reads knit more stability', effect: { stability: 2 } }],
      [{ name: 'Bulwark Oath', desc: 'The read window opens wider', effect: { window: 8 } },
       { name: 'Sentinel Oath', desc: 'Resonance gathers faster', effect: { resGain: 8 } }],
      [{ name: 'Immovable', desc: 'Perfect reads knit yet more stability', effect: { stability: 3 } },
       { name: 'Bastion', desc: 'A sealed rift yields more shards', effect: { shardLuck: 8 } }],
    ],
  },
  SCALESWORN: {
    cores: ['Scaled Edge', 'Emberscale', 'Wyrmstrike', "Dragon's Wrath", 'Cataclysm Scale', 'The Elder Wyrm'],
    branches: [
      [{ name: 'Rending Doctrine', desc: 'Strikes crit more often', effect: { crit: 5 } },
       { name: 'Searing Doctrine', desc: 'Counters strike back harder', effect: { counter: 18 } }],
      [{ name: "Predator's Focus", desc: 'Resonance gathers faster', effect: { resGain: 10 } },
       { name: 'Savage Momentum', desc: 'Counters strike back far harder', effect: { counter: 22 } }],
      [{ name: 'Apex', desc: 'Strikes crit yet more often', effect: { crit: 7 } },
       { name: 'Ruin', desc: 'Counters become devastating', effect: { counter: 28 } }],
    ],
  },
  DRYADIC: {
    cores: ['Rootbond', 'Verdant Grace', 'Thornward', 'Bloomsurge', 'Ancient Grove', 'The World Tree'],
    branches: [
      [{ name: 'Renewal', desc: 'Perfect reads knit more stability', effect: { stability: 3 } },
       { name: 'Bramble', desc: 'Counters strike back harder', effect: { counter: 15 } }],
      [{ name: 'Photosynthesis', desc: 'Resonance gathers faster', effect: { resGain: 12 } },
       { name: 'Deeproot', desc: 'The read window opens wider', effect: { window: 10 } }],
      [{ name: 'Evergreen', desc: 'Perfect reads knit yet more stability', effect: { stability: 4 } },
       { name: 'Wildgrowth', desc: 'A sealed rift yields more shards', effect: { shardLuck: 8 } }],
    ],
  },
  HARVESTER: {
    cores: ['Cull', "Gleaner's Eye", "Reaper's Toll", 'Soul Harvest', 'Dread Sickle', 'The Final Reaping'],
    branches: [
      [{ name: 'Fortune', desc: 'A sealed rift yields more shards', effect: { shardLuck: 12 } },
       { name: 'Scavenger', desc: 'Strikes gain a crit chance', effect: { crit: 4 } }],
      [{ name: 'Deathbind', desc: 'Strikes crit more often', effect: { crit: 5 } },
       { name: 'Grave Momentum', desc: 'Resonance gathers faster', effect: { resGain: 10 } }],
      [{ name: 'Abundance', desc: 'Shard yield climbs again', effect: { shardLuck: 15 } },
       { name: 'Windfall', desc: 'Counters strike back harder', effect: { counter: 18 } }],
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
      const opt = opts[oi];
      nodes.push({ id: `${key}_b${jobLevel}_${sfx}`, job, jobLevel, kind: 'branch', group, name: opt.name, desc: opt.desc, resonance: BRANCH_RES, effects: opt.effect });
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
