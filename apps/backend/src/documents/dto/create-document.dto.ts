import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsBoolean,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { DocumentCategory } from '@prisma/client';

export class CreateDocumentDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(DocumentCategory)
  category: DocumentCategory;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  domain?: string;

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
  classification?: string; // PUBLIC | INTERNE | CONFIDENTIEL | SECRET

  // Inline editor: HTML content written directly in the intranet
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  content?: string;
}

export class UpdateInlineContentDto {
  @IsString()
  @MaxLength(2_000_000)
  content: string;
}
