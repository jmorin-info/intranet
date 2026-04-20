import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  ValidateIf,
  IsBooleanString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCertificateDto {
  @IsString()
  name: string;

  @IsString()
  certType: string;

  @IsDateString()
  obtainedAt: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSizeBytes?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBooleanString()
  isExternal?: string;

  @ValidateIf((o) => !o.externalPersonId)
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsUUID()
  externalPersonId?: string;
}
