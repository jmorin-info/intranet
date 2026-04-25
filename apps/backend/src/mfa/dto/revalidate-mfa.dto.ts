import { IsString, Length } from 'class-validator';

export class RevalidateMfaDto {
  /**
   * Code TOTP à 6 chiffres, ou code de secours hexadécimal (8 caractères).
   * On accepte 6..16 caractères pour couvrir les deux cas — la validation fine
   * (TOTP vs backup) est faite dans `MfaService.verifyMfa()`.
   */
  @IsString()
  @Length(6, 16)
  code!: string;
}
