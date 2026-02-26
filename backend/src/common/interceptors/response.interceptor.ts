// ============================================================
// PIK — Response Interceptor
//
// Wraps every successful controller response in:
//   { status: "ok", data: <controller return value> }
//
// This preserves the exact response shape the dashboard and
// HV connector expect from the Python MVP.
//
// Place at: src/common/interceptors/response.interceptor.ts
// ============================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface PikResponse<T> {
  status: 'ok';
  data: T;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, PikResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<PikResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        status: 'ok' as const,
        data,
      })),
    );
  }
}
