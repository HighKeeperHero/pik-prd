// ============================================================
// PIK — Doctrine logic (canon §13.5) — pure, no DI.
//
// Derives the doctrine tree state and its Resonance contribution
// from (job, jobLevel, selections). Selections are the player's
// chosen BRANCH node ids; core nodes are implicit from Job Level.
// Imported by DoctrineService, GearService (Resonance additive
// layer), and the hero-payload serializer.
// ============================================================
import { catalogForJob, doctrineById, DoctrineNode, DoctrineEffect } from './doctrine.catalog';

export type NodeStatus = 'unlocked' | 'available' | 'locked';

export interface DoctrineNodeState extends DoctrineNode {
  status:   NodeStatus;
  selected: boolean;   // branch nodes only
}

/** Sanitize a raw `doctrines` JSON value into a string[] of node ids. */
export function selectionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

/** Full tree state for a hero. */
export function doctrineTree(
  job: string | null | undefined,
  jobLevel: number,
  selections: string[],
): DoctrineNodeState[] {
  const chosen = new Set(selections);
  return catalogForJob(job).map(n => {
    let status: NodeStatus;
    let selected = false;
    if (n.kind === 'core') {
      status = jobLevel >= n.jobLevel ? 'unlocked' : 'locked';
    } else {
      selected = chosen.has(n.id);
      if (selected) status = 'unlocked';
      else if (jobLevel < n.jobLevel) status = 'locked';
      else status = 'available';
    }
    return { ...n, status, selected };
  });
}

/** Resonance from doctrine — active cores (Job Level met) + chosen
 *  branches. Feeds the additive layer in getComputedResonance. */
export function doctrineResonance(
  job: string | null | undefined,
  jobLevel: number,
  selections: string[],
): number {
  const chosen = new Set(selections);
  return catalogForJob(job).reduce((sum, n) => {
    if (n.kind === 'core') return jobLevel >= n.jobLevel ? sum + n.resonance : sum;
    return chosen.has(n.id) ? sum + n.resonance : sum;
  }, 0);
}

/** Summed combat effects from the hero's CHOSEN branches (Phase 4b).
 *  Cores carry no effects — their weight is Resonance. All fields
 *  present, zero-defaulted, so consumers can read without guards. */
export function doctrineEffects(
  job: string | null | undefined,
  selections: string[],
): Required<DoctrineEffect> {
  const out: Required<DoctrineEffect> = {
    crit: 0, window: 0, resGain: 0, stability: 0, shardLuck: 0, counter: 0,
  };
  if (!job) return out;
  for (const id of selections) {
    const n = doctrineById(id);
    if (!n || n.job !== job || !n.effects) continue;
    for (const [k, v] of Object.entries(n.effects)) {
      if (k in out && typeof v === 'number') out[k as keyof DoctrineEffect] += v;
    }
  }
  return out;
}

export type ChoiceError = 'unknown_node' | 'wrong_job' | 'not_a_branch' | 'level_locked' | 'group_taken';

/** Validate a branch choice. Returns null on success, else a reason.
 *  A milestone group can hold only one selection — respec to change. */
export function validateChoice(
  job: string | null | undefined,
  jobLevel: number,
  selections: string[],
  nodeId: string,
): ChoiceError | null {
  const node = doctrineById(nodeId);
  if (!node) return 'unknown_node';
  if (!job || node.job !== job) return 'wrong_job';
  if (node.kind !== 'branch') return 'not_a_branch';
  if (jobLevel < node.jobLevel) return 'level_locked';
  const groupTaken = selections
    .map(doctrineById)
    .some(s => s && s.group === node.group && s.id !== nodeId);
  if (groupTaken) return 'group_taken';
  return null;
}

/** Prune selections that no longer validate (defensive; e.g. a def
 *  was removed). Keeps only branch ids that exist for the job. */
export function pruneSelections(job: string | null | undefined, selections: string[]): string[] {
  return selections.filter(id => {
    const n = doctrineById(id);
    return n && n.kind === 'branch' && job && n.job === job;
  });
}
