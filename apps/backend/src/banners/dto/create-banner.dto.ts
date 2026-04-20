import { IsString, IsEnum, IsOptional, MinLength, IsDateString } from 'class-validator';

const BANNER_LEVELS = ['P1', 'P2', 'P3'] as const;

export class CreateBannerDto {
  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(5)
  message: string;

  @IsOptional()
  @IsEnum(BANNER_LEVELS)
  level?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
