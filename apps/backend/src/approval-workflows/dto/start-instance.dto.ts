import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';

class StepApproverOverrideDto {
  @IsString()
  @Length(1, 128)
  stepId: string;

  @IsUUID()
  approverUserId: string;
}

export class StartInstanceDto {
  @IsUUID()
  documentVersionId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StepApproverOverrideDto)
  stepOverrides?: StepApproverOverrideDto[];
}

export class StartDocumentInstanceDto extends StartInstanceDto {
  @IsUUID()
  workflowId: string;
}

export class ReorderWorkflowStepsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  orderedStepIds: string[];
}
