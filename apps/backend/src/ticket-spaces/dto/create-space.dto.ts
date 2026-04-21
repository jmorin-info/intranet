import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSpaceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  /** Optionnel — auto-généré depuis name si absent. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedCategories?: string[];
}

export class UpdateSpaceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedCategories?: string[];

  /**
   * Override des SLA globaux pour cet espace (en heures, par priorité).
   * Exemple : { CRITICAL: 2, HIGH: 8, MEDIUM: 48, LOW: 120 } pour l'IT.
   * Si null → utilise les SLA globaux par défaut.
   */
  @IsOptional()
  @IsObject()
  slaConfig?: Record<string, number> | null;

  /**
   * Configuration métier spécifique à l'espace. Peut contenir :
   *   - subcategories: Array<{ value, label, color?, icon? }> — sous-catégories
   *     custom (ex: IT a RMA, Déploiement, Support N1 ; RH a Congés, Paie)
   *   - defaultPriority: TicketPriority par défaut à la création
   *   - requireDescription, requireAttachment: booleans
   *   - customFields: Array<{ name, type, required, options? }>
   */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown> | null;
}
