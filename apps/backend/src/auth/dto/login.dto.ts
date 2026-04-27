import {
  IsEmail,
  IsString,
  IsOptional,
  IsObject,
  MinLength,
  Length,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;

  /**
   * Wave D item 18 — alternative WebAuthn au mfaCode TOTP. Le frontend a
   * récupéré les options via POST /auth/login/webauthn-options (public,
   * email-based) et signé avec navigator.credentials.get(). Le backend
   * vérifie la signature avec WebAuthnService.verifyAuthentication.
   */
  @IsOptional()
  @IsObject()
  webauthnResponse?: Record<string, unknown>;
}
