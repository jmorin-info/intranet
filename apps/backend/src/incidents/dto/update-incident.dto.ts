import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  IncidentCategoryValue,
  IncidentSeverityValue,
} from './create-incident.dto';

export const INCIDENT_STATUSES = [
  'DETECTED',
  'UNDER_INVESTIGATION',
  'CONTAINED',
  'ERADICATED',
  'RECOVERED',
  'CLOSED',
] as const;
export type IncidentStatusValue = (typeof INCIDENT_STATUSES)[number];

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(INCIDENT_CATEGORIES)
  category?: IncidentCategoryValue;

  @IsOptional()
  @IsEnum(INCIDENT_SEVERITIES)
  severity?: IncidentSeverityValue;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedSystems?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  affectedUsers?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  impactSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rootCause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  lessonsLearned?: string;

  @IsOptional()
  @IsBoolean()
  gdprNotifiable?: boolean;

  @IsOptional()
  @IsBoolean()
  cnilReported?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ChangeStatusDto {
  @IsEnum(INCIDENT_STATUSES)
  status!: IncidentStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class TimelineEntryDto {
  @IsOptional()
  @IsEnum(['COMMENT', 'ACTION', 'EVIDENCE'])
  entryType?: 'COMMENT' | 'ACTION' | 'EVIDENCE';

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}
