import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsEnum,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { DocumentCategory, UserRole } from '@prisma/client';

/**
 * Condition d'une règle (DTO faiblement typé : JSONB côté DB).
 * Toutes les clés sont optionnelles ; si plusieurs sont renseignées
 * elles sont combinées en AND. Pour chaque clé, une valeur sous forme
 * de tableau exprime un OR (ex. classification ∈ [CONFIDENTIEL, SECRET]).
 */
export class WorkflowRuleConditionDto {
  @IsOptional()
  @IsString({ each: true })
  classification?: string | string[];

  @IsOptional()
  @IsEnum(DocumentCategory, { each: true })
  category?: string | string[];

  @IsOptional()
  @IsUUID('all', { each: true })
  departmentId?: string | string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minAmount?: number;
}

/** Étape d'une règle (palier d'approbation à instancier). */
export class WorkflowRuleStepDto {
  @IsInt()
  @Min(1)
  @Max(100)
  level: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  approverRole?: string;

  @IsOptional()
  @IsUUID()
  approverUserId?: string;

  @IsOptional()
  @IsUUID()
  approverDeptId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  deadlineHours?: number;

  @IsOptional()
  @IsBoolean()
  parallel?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  parallelGroupId?: string;
}

export class CreateWorkflowRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @ValidateNested()
  @Type(() => WorkflowRuleConditionDto)
  condition: WorkflowRuleConditionDto;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WorkflowRuleStepDto)
  steps: WorkflowRuleStepDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
