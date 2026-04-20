import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  IsBooleanString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCertificateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  certType?: string;

  @IsOptional()
  @IsDateString()
  obtainedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  fileUrl?: string | null;

  @IsOptional()
  @IsString()
  fileName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSizeBytes?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBooleanString()
  isExternal?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  externalPersonId?: string;
}
