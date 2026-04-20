import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

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
