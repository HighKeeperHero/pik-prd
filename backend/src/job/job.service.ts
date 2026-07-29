// ============================================================
// PIK — Job Service (canon §13.4)
//
// Read-side of Job progression. JobXP is granted by the
// LevelingService's grant hook (the central XP choke point); this
// service derives Job Level / JobRank from the stored jobXp and
// serves the Job progress view. Job Level gates Doctrine (Phase 4).
// ============================================================
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  jobLevelFromXp, jobRankForLevel, jobXpToReach, jobXpForLevel,
  nextJobRank, MAX_JOB_LEVEL,
} from './job.constants';

export interface JobProgress {
  hero_class:      string | null;
  unlocked:        boolean;   // a Job has been chosen (L40)
  job_xp:          number;
  job_level:       number;
  job_rank:        string;
  job_xp_in_level: number;
  job_xp_to_next:  number;    // 0 at the level cap
  next_rank:       string | null;
  next_rank_level: number | null;
  max_level:       number;
}

@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

  async getJobProgress(rootId: string): Promise<JobProgress | null> {
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { heroClass: true, jobXp: true },
    });
    if (!hero) return null;

    const jobXp = hero.jobXp ?? 0;
    const level = jobLevelFromXp(jobXp);
    const rank  = jobRankForLevel(level);
    const base  = jobXpToReach(level);
    const next  = nextJobRank(level);

    return {
      hero_class:      hero.heroClass ?? null,
      unlocked:        !!hero.heroClass,
      job_xp:          jobXp,
      job_level:       level,
      job_rank:        rank,
      job_xp_in_level: jobXp - base,
      job_xp_to_next:  jobXpForLevel(level),
      next_rank:       next ? next.name : null,
      next_rank_level: next ? next.minLevel : null,
      max_level:       MAX_JOB_LEVEL,
    };
  }
}
