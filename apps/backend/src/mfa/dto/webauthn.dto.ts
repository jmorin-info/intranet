import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Body de POST /mfa/webauthn/register/verify.
 * `response` est le JSON renvoyé par `startRegistration()` côté browser
 * (lib `@simplewebauthn/browser`). On le valide comme objet — la
 * vérification cryptographique est faite par `verifyRegistrationResponse`.
 */
export class VerifyWebAuthnRegistrationDto {
  @IsObject()
  response!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

export class VerifyWebAuthnAuthenticationDto {
  @IsObject()
  response!: Record<string, unknown>;
}
