import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsBoolean,
  IsDateString,
  IsIn,
  MaxLength,
} from 'class-validator';
import { DocumentCategory } from '@prisma/client';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  isoControlIds?: string[];

  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @IsUUID()
  approverId?: string;

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL', 'APPROVED', 'OBSOLETE', 'ARCHIVED'])
  status?: string;
}
