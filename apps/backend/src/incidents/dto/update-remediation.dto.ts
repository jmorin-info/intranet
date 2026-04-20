import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { REMEDIATION_PRIORITIES, RemediationPriority } from './create-remediation.dto';

export const REMEDIATION_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'DONE',
  'BLOCKED',
  'CANCELLED',
] as const;
export type RemediationStatus = (typeof REMEDIATION_STATUSES)[number];

export class UpdateRemediationDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(REMEDIATION_PRIORITIES)
  priority?: RemediationPriority;

  @IsOptional()
  @IsEnum(REMEDIATION_STATUSES)
  status?: RemediationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  evidence?: string;
}

export class CompleteRemediationDto {
  @IsString()
  @MaxLength(5000)
  evidence!: string;
}
