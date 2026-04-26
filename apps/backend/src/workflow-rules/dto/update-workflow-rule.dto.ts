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
import {
  WorkflowRuleConditionDto,
  WorkflowRuleStepDto,
} from "./create-workflow-rule.dto";

/**
 * DTO de mise à jour partielle d'une règle. Toutes les clés sont optionnelles ;
 * un PATCH peut donc se contenter de basculer `isActive` sans réémettre
 * `condition` ou `steps`.
 */
export class UpdateWorkflowRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowRuleConditionDto)
  condition?: WorkflowRuleConditionDto;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => WorkflowRuleStepDto)
  steps?: WorkflowRuleStepDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
