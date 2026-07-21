// ============================================================
// HEP — Self-or-Admin Guard (Phase 2, Slice 0)
//
// Authorizes a route that acts on one hero's behalf. Passes when
// EITHER:
//   • the caller is that hero (valid account session whose selected
//     hero matches the :root_id path param), or
//   • the caller is Heroes staff (valid X-HV-Admin-Key)
//
// Used on the consent routes. A consent receipt is the record of a
// player agreeing to let a venue write to their identity — it is the
// legal and ethical backbone of cross-venue progression, so it must
// not be forgeable by a third party. Before Phase 2 Slice 0 these
// routes had no guard, so anyone could grant consent from any hero
// to any partner, or revoke it.
//
// Staff are allowed because venue onboarding and support both need
// to establish and repair links on a player's behalf (e.g. a kiosk
// enrollment where the player consents in person). Every grant and
// revoke is already written to the identity ledger with grantedBy /
// revokedBy, so the action stays attributable.
//
// Place at: src/auth/guards/self-or-admin.guard.ts
// ============================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AccountGuard } from './account.guard';
import { PlatformAdminGuard } from './platform-admin.guard';

@Injectable()
export class SelfOrAdminGuard implements CanActivate {
  constructor(
    private readonly accountGuard: AccountGuard,
    private readonly adminGuard: PlatformAdminGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Staff path first — it needs no account session, and a support
    // operator acting on a player has no Bearer token to offer.
    if (request.headers['x-hv-admin-key']) {
      // Delegate so an invalid staff key is rejected outright rather
      // than silently falling through to the player path.
      return this.adminGuard.canActivate(context);
    }

    await this.accountGuard.canActivate(context);

    const targetRootId = request.params?.root_id;
    if (!request.heroId || request.heroId !== targetRootId) {
      throw new ForbiddenException(
        'You may only manage consent for your own hero',
      );
    }

    return true;
  }
}
