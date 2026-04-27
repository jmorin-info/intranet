import {
  IsString,
  IsOptional,
  IsObject,
  IsUUID,
  IsBoolean,
  IsDateString,
  MaxLength,
} from "class-validator";

/**
 * Instanciation d'un DocumentTemplate.
 *
 * `variables` est un Record<string, string> où la clé correspond au `key`
 * d'une variable du template. Toutes les variables `required: true` doivent
 * être fournies (sinon BadRequestException avec liste des manquantes).
 *
 * `title` permet d'overrider le titre auto-généré (défaut : nom du template).
 */
export class InstantiateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsObject()
  variables: Record<string, string>;

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsUUID()
  approverId?: string;

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
