// ============================================================
// PIK — Push Service
//
// v1.0 scope: store an Expo push token on the hero so the
// dispatcher (post-v1.0) can send notifications targeting
// individual players. One token per hero; re-registering on a
// new device overwrites the prior token.
// ============================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  /** Upsert the push token for a hero. Idempotent — calling with the
   *  same token still bumps the timestamp so we can age out stale
   *  tokens later. */
  async registerToken(rootId: string, token: string) {
    return this.prisma.rootIdentity.update({
      where: { id: rootId },
      data:  { pushToken: token, pushUpdatedAt: new Date() },
    });
  }

  /** Clear the token (called on logout or when Expo reports it as
   *  invalid in a future dispatcher pass). */
  async clearToken(rootId: string) {
    return this.prisma.rootIdentity.update({
      where: { id: rootId },
      data:  { pushToken: null, pushUpdatedAt: new Date() },
    });
  }
}
