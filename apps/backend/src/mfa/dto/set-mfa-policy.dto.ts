import { IsBoolean } from 'class-validator';

export class SetMfaPolicyDto {
  /**
   * true → impose le MFA à cet utilisateur (mfaRequired=true) + trace l'admin
   * actor + horodate dans mfaEnforcedAt.
   * false → lève la politique (mfaRequired=false). Ne désactive pas un MFA
   * déjà actif (utiliser /mfa/disable/:userId pour ça).
   */
  @IsBoolean()
  enforced!: boolean;
}
