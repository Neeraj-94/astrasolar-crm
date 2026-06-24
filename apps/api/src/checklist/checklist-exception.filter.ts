import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../db';

/**
 * Diagnostic exception filter for the checklist routes.
 *
 * NestJS's default turns any non-HttpException into an opaque
 * `500 { message: "Internal server error" }`, which hides the real cause. This
 * filter logs the full error server-side and returns the actual error
 * name/message (and Prisma error code/meta when relevant) so the failure is
 * visible in the client and the network tab. HttpExceptions (validation 400s,
 * our own structured errors) pass straight through unchanged.
 */
@Catch()
export class ChecklistExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Checklist');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ method: string; url: string }>();

    // Pass through framework/HTTP exceptions untouched.
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const err = exception as any;
    const isPrisma =
      exception instanceof Prisma.PrismaClientKnownRequestError ||
      exception instanceof Prisma.PrismaClientValidationError ||
      exception instanceof Prisma.PrismaClientInitializationError;

    this.logger.error(
      `${req.method} ${req.url} failed: ${err?.name ?? 'Error'} ${err?.code ? `[${err.code}] ` : ''}${err?.message ?? exception}`,
      err?.stack,
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: err?.name ?? 'InternalServerError',
      // Surface the real reason so it shows in the modal / network tab.
      message: err?.message ?? 'Unknown server error',
      ...(isPrisma
        ? { prismaCode: err?.code ?? null, meta: err?.meta ?? null }
        : {}),
    });
  }
}
