import { Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
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
    MfaModule,
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
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
