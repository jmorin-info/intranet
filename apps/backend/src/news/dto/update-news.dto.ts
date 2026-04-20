import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateNewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(UserRole, { each: true })
  targetRoles?: UserRole[];
}
