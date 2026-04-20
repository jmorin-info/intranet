import { IsString, IsEnum, IsOptional, MinLength, MaxLength, IsDateString } from 'class-validator';

const ALERT_SEVERITIES = ['P1', 'P2', 'P3'] as const;

export class CreateAlertDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  content: string;

  @IsEnum(ALERT_SEVERITIES)
  severity: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
