// ============================================================
// PIK — Doctrine Service (canon §13.5)
//
// Job-Level-gated class depth. Core nodes unlock by Job Level;
// branch milestones are chosen (1 of 2) and stored in the
// `doctrines` JSON column. Respec (Hall of Masters) clears the
// branch selections. Doctrine Resonance feeds the additive layer
// (§13.2) via doctrine.logic, consumed by GearService.
// ============================================================
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { jobLevelFromXp } from '../job/job.constants';
import {
  doctrineTree, doctrineResonance, validateChoice,
  selectionList, pruneSelections,
} from './doctrine.logic';

@Injectable()
export class DoctrineService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(rootId: string) {
    const hero = await this.prisma.rootIdentity.findUnique({
      where:  { id: rootId },
      select: { heroClass: true, jobXp: true, doctrines: true },
    });
    if (!hero) return null;
    const heroClass  = hero.heroClass ?? null;
    const jobLevel   = jobLevelFromXp(hero.jobXp ?? 0);
    const selections = pruneSelections(heroClass, selectionList(hero.doctrines));
    return { heroClass, jobLevel, selections };
  }

  async getState(rootId: string) {
    const h = await this.load(rootId);
    if (!h) return null;
    return {
      hero_class:         h.heroClass,
      unlocked:           !!h.heroClass,   // a Job has been chosen (L40)
      job_level:          h.jobLevel,
      doctrine_resonance: doctrineResonance(h.heroClass, h.jobLevel, h.selections),
      selections:         h.selections,
      nodes:              doctrineTree(h.heroClass, h.jobLevel, h.selections),
    };
  }

  async choose(rootId: string, nodeId: string) {
    const h = await this.load(rootId);
    if (!h) throw new NotFoundException('Hero not found');
    const err = validateChoice(h.heroClass, h.jobLevel, h.selections, nodeId);
    if (err) throw new BadRequestException(`Cannot select doctrine (${err})`);
    const next = [...h.selections, nodeId];
    await this.prisma.rootIdentity.update({ where: { id: rootId }, data: { doctrines: next } });
    return this.getState(rootId);
  }

  /** Respec — the Hall of Masters. Clears all branch selections
   *  (cores are implicit and untouched). Cost/gating is design-open. */
  async respec(rootId: string) {
    const h = await this.load(rootId);
    if (!h) throw new NotFoundException('Hero not found');
    await this.prisma.rootIdentity.update({ where: { id: rootId }, data: { doctrines: [] } });
    return this.getState(rootId);
  }
}
