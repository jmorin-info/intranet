import { Module, Logger, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HibpService } from './hibp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SecFetchSiteGuard } from './sec-fetch-site.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { LdapModule } from '../ldap/ldap.module';
import { MfaModule } from '../mfa/mfa.module';

const WEAK_JWT_DEFAULT = 'omnitech-access-secret-change-me';
const authModuleLogger = new Logger('AuthModule');

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    LdapModule,
    forwardRef(() => MfaModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET || WEAK_JWT_DEFAULT;
        if (!process.env.JWT_ACCESS_SECRET || secret === WEAK_JWT_DEFAULT) {
          authModuleLogger.warn(
            'SECURITY WARNING: JWT_ACCESS_SECRET is not set or uses the insecure default. ' +
            'Set a strong random secret in your environment before deploying to production.',
          );
        }
        return {
          secret,
          signOptions: {
            // ANSSI R28 — durée de vie access token réduite à 30min pour
            // les intranets. Le refresh token (7j, one-time use) gère la
            // continuité de session sans exposer un JWT longue durée.
            expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '30m') as any,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    HibpService,
    // SecFetchSiteGuard global : defense in depth contre CSRF cross-site sur
    // les méthodes mutantes. Mode enforce piloté par SEC_FETCH_SITE_ENFORCE
    // (true en prod par défaut, false en dev). Opt-out via @AllowCrossSite().
    { provide: APP_GUARD, useClass: SecFetchSiteGuard },
  ],
  exports: [AuthService, JwtModule, HibpService],
})
export class AuthModule {}
