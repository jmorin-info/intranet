import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
  IsBoolean,
  IsDateString,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { DocumentCategory, DocumentLevel, DocumentPriority } from "@prisma/client";

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
  @IsUUID("4", { each: true })
  isoControlIds?: string[];

  // Vérificateur (contrôle technique, étape VERIFICATION) — cycle qualité 5 rôles.
  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsUUID()
  verifierId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsUUID()
  reviewerId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === "" ? undefined : value))
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

  // --- Champs REG_016 (registre documentaire SMSI) ---
  // Sans ces déclarations, le ValidationPipe global (whitelist +
  // forbidNonWhitelisted, main.ts) rejette en 400 toute création envoyant
  // ces champs — or le formulaire /documents/new les envoie quasi toujours
  // (documentLevel/priority auto-déduits de la catégorie).
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
