import {
  IsString,
  IsOptional,
  IsEnum,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { ContentStatus } from "@prisma/client";
import { SLUG_REGEX } from "./create-content-page.dto";

/**
 * Patch d'une ContentPage. Tous les champs sont optionnels — seuls ceux fournis
 * sont mis à jour. Le service crée une `ContentRevision` snapshot du contenu
 * avant écrasement. Le `status` peut être patché ici (pour passer DRAFT→DRAFT)
 * mais les transitions PUBLISH/UNPUBLISH passent par les endpoints dédiés.
 */
export class UpdateContentPageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, {
    message:
      "slug doit être en minuscules, chiffres et tirets uniquement (ex: mentions-legales)",
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content?: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  seoDescription?: string;

  /** Message libre joint à la révision créée. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  revisionComment?: string;
}
