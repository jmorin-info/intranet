import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const INCIDENT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type IncidentSeverityValue = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_CATEGORIES = [
  'MALWARE',
  'PHISHING',
  'DATA_BREACH',
  'UNAUTHORIZED_ACCESS',
  'DENIAL_OF_SERVICE',
  'PHYSICAL_SECURITY',
  'CONFIGURATION_ERROR',
  'LOST_STOLEN_DEVICE',
  'USER_ERROR',
  'THIRD_PARTY',
  'OTHER',
] as const;
export type IncidentCategoryValue = (typeof INCIDENT_CATEGORIES)[number];

export class CreateIncidentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  description!: string;

  @IsEnum(INCIDENT_CATEGORIES)
  category!: IncidentCategoryValue;

  @IsEnum(INCIDENT_SEVERITIES)
  severity!: IncidentSeverityValue;

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
  @IsBoolean()
  gdprNotifiable?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
