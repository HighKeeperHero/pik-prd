// src/auth/guards/account.guard.ts
// Validates Bearer token from AccountSession table.
// Attaches accountId and heroId (if selected) to request.

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { FateAccountService } from '../../fate-account/fate-account.service';

@Injectable()
export class AccountGuard implements CanActivate {
  constructor(private readonly accountService: FateAccountService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const session = await this.accountService.validateSession(token);

    if (!session) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    req.accountId = session.accountId;
    req.heroId    = session.heroId;
    req.rawToken  = token;

    return true;
  }
}
