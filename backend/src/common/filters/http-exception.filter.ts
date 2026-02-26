// ============================================================
// PIK — HTTP Exception Filter
//
// Converts all thrown exceptions to:
//   { status: "error", message: "<reason>" }
//
// This matches the Python MVP's error response shape.
// The dashboard checks for status === "error" to display
// error messages in the UI.
//
// Place at: src/common/filters/http-exception.filter.ts
// ============================================================

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // class-validator returns { message: string[] } for validation errors.
      // Flatten to a single string for the MVP-compatible response shape.
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        if (Array.isArray(resp.message)) {
          message = resp.message.join('; ');
        } else if (typeof resp.message === 'string') {
          message = resp.message;
        } else {
          message = exception.message;
        }
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        message = exception.message;
      }
    } else {
      // Unexpected / unhandled errors — log full details, return generic message.
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';

      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      status: 'error',
      message,
    });
  }
}
