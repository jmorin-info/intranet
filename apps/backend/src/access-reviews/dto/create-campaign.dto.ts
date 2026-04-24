import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Enumération des types de campagne de revue (ISO 27001 A.5.18).
 * - ACCESS_RIGHTS  : revue des droits utilisateurs (par défaut, historique)
 * - PASSWORDS      : revue des mots de passe (rotation / absence MFA)
 * - INACTIVE_USERS : revue des comptes inactifs (≥ 90 jours sans connexion)
 */
export enum AccessReviewCampaignTypeDto {
  ACCESS_RIGHTS = 'ACCESS_RIGHTS',
  PASSWORDS = 'PASSWORDS',
  INACTIVE_USERS = 'INACTIVE_USERS',
}

/**
 * DTO for creating an AccessReviewCampaign (ISO 27001 A.5.18).
 * Matches AccessReviewsService.createCampaign signature.
 */
export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(AccessReviewCampaignTypeDto)
  type?: AccessReviewCampaignTypeDto;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsUUID()
  scopeDepartmentId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeRoles?: string[];
}
