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
} from "class-validator";
import { DocumentCategory, DocumentLevel, DocumentPriority } from "@prisma/client";

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
  @IsUUID("4", { each: true })
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

  // --- Champs REG_016 (cf. CreateDocumentDto) — sinon PATCH rejeté en 400 ---
  @IsOptional()
  @IsString()
  @MaxLength(50)
  parentReference?: string;

  @IsOptional()
  @IsEnum(DocumentLevel)
  documentLevel?: DocumentLevel;

  @IsOptional()
  @IsEnum(DocumentPriority)
  priority?: DocumentPriority;

  @IsOptional()
  @IsBoolean()
  blocking?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reviewPeriodicity?: string;

  @IsOptional()
  @IsIn([
    "DRAFT",
    "IN_REVIEW",
    "REVIEW_APPROVED",
    "PENDING_APPROVAL",
    "APPROVED",
    "OBSOLETE",
    "ARCHIVED",
  ])
  status?: string;
}
