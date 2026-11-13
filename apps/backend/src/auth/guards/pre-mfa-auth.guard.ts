import { CanActivate, ExecutionContext, Injectable, Type } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Résout l'identité avant les politiques MFA globales des routes JWT. */
@Injectable()
export class PreMfaAuthGuard extends JwtAuthGuard {
  constructor(private readonly metadata: Reflector) {
    super(metadata);
  }

  canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;

    const guards = this.metadata.getAllAndMerge<(CanActivate | Type<CanActivate>)[]>(
      GUARDS_METADATA,
      [context.getHandler(), context.getClass()],
    ) || [];

    // Les autres routes conservent leur authentification propre (liens signés,
    // webhooks, calendrier ICS). @Public est traité par JwtAuthGuard.
    if (!guards.some((guard) => guard === JwtAuthGuard)) return true;
    return super.canActivate(context);
  }
}
