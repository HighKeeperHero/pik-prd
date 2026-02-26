// ============================================================
// PIK — Session Guard
//
// Validates Bearer session tokens on protected routes.
// Attaches the authenticated rootId to the request object
// so controllers can access it without re-querying.
//
// Usage:
//   @UseGuards(SessionGuard)
//   @Get('protected')
//   async handler(@Req() req: Request & { rootId: string }) { ... }
//
// Place at: src/auth/guards/session.guard.ts
// ============================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extract Bearer token from Authorization header
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header. Expected: Bearer <session_token>',
      );
    }

    const token = authHeader.substring(7); // Strip "Bearer "

    if (!token) {
      throw new UnauthorizedException('Empty session token');
    }

    // Validate the token
    const rootId = await this.authService.validateSessionToken(token);

    if (!rootId) {
      throw new UnauthorizedException(
        'Invalid or expired session token',
      );
    }

    // Attach the authenticated rootId to the request
    request.rootId = rootId;

    return true;
  }
}
