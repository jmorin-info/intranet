import {
  IsOptional,
  IsEnum,
  IsString,
  IsUUID,
  IsDateString,
  IsNumberString,
  IsBooleanString,
  IsIn,
  MaxLength,
} from "class-validator";
import { DocumentStatus, DocumentCategory, DocumentLevel, DocumentPriority } from "@prisma/client";

export class DocumentFiltersDto {
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsIn(['drafts', 'review', 'published', 'expired', 'archived'])
  statusGroup?: 'drafts' | 'review' | 'published' | 'expired' | 'archived';

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  // Filtres REG_016 — permettent de retrouver un document par niveau
  // documentaire, priorité ou caractère bloquant hors espace admin.
  @IsOptional()
  @IsEnum(DocumentLevel)
  documentLevel?: DocumentLevel;

  @IsOptional()
  @IsEnum(DocumentPriority)
  priority?: DocumentPriority;

  @IsOptional()
  @IsBooleanString()
  blocking?: string;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  isoControlCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}
