import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export enum StepDecision {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export class DecideStepDto {
  @IsEnum(StepDecision)
  decision: StepDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
