import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitTestimonialDto {
  @IsString()
  @MinLength(20, { message: 'Minimum 20 caractères (phrase complète).' })
  @MaxLength(280, { message: 'Maximum 280 caractères — format court.' })
  quote!: string;

  /**
   * Libellé affiché en signature (ex: « — Direction Technique »).
   * Si vide, fallback sur le département réel de l'utilisateur — ou
   * "— Collaborateur OMNITECH" si aucune info dispo.
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
}

export class RejectTestimonialDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
