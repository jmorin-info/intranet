import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { BehaviorAlertSeverity, BehaviorAlertStatus } from "@prisma/client";

export class ListAlertsDto {
  @IsOptional()
  @IsEnum(BehaviorAlertStatus)
  status?: BehaviorAlertStatus;

  @IsOptional()
  @IsString()
  /** CSV de severities, ex "HIGH,CRITICAL". */
  severity?: string;

  @IsOptional()
  @IsString()
  ruleCode?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class TransitionAlertDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpdateRuleDto {
  @IsOptional()
  enabled?: boolean;

  @IsOptional()
  threshold?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
  severity?: BehaviorAlertSeverity;
}
