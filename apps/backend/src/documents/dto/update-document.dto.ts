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
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import { DocumentCategory, DocumentLevel, DocumentPriority } from "@prisma/client";

/**
 * Le formulaire d'édition envoie systématiquement certains champs via un spread
 * du payload — une chaîne vide '' pour « non renseigné ». Or @IsDateString /
 * @IsUUID rejettent '' → 400. On normalise donc '' → undefined (champ ignoré,
 * valeur DB inchangée). `null` explicite reste accepté (désassignation).
 */
const emptyToUndefined = ({ value }: { value: unknown }) => (value === "" ? undefined : value);

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

  // Vérificateur (contrôle technique, étape VERIFICATION) — cycle qualité 5 rôles.
  // null = désassignation explicite ; '' → undefined (ignoré).
  @IsOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  verifierId?: string | null;

  @IsOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  reviewerId?: string | null;

  @IsOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  approverId?: string | null;

  @IsOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  nextReviewDate?: string | null;

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
