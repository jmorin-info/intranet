import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Condition d'une règle (DTO faiblement typé : JSONB côté DB).
 * Toutes les clés sont optionnelles ; si plusieurs sont renseignées
 * elles sont combinées en AND. Pour chaque clé, une valeur sous forme
 * de tableau exprime un OR (ex. classification ∈ [CONFIDENTIEL, SECRET]).
 */
export class WorkflowRuleConditionDto {
  @IsOptional()
  classification?: string | string[];

  @IsOptional()
  category?: string | string[];

  @IsOptional()
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
  level: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  approverRole?: string;

  @IsOptional()
  @IsString()
  approverUserId?: string;

  @IsOptional()
  @IsString()
  approverDeptId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  deadlineHours?: number;

  @IsOptional()
  @IsBoolean()
  parallel?: boolean;

  @IsOptional()
  @IsString()
  parallelGroupId?: string;
}

export class CreateWorkflowRuleDto {
  @IsString()
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
  @ValidateNested({ each: true })
  @Type(() => WorkflowRuleStepDto)
  steps: WorkflowRuleStepDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
