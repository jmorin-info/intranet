import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const REMEDIATION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type RemediationPriority = (typeof REMEDIATION_PRIORITIES)[number];

export class CreateRemediationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  title!: string;

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
}
