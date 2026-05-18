import {
  IsString,
  IsOptional,
  IsEnum,
  IsIn,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { ContentStatus } from "@prisma/client";
import { SUPPORTED_LOCALES, ContentLocale } from "./create-content-page.dto";

/**
 * Clé namespacée en notation pointée : `welcome.hero.title`,
 * `welcome.services`, `trust.commitment.iso27001`. Lowercase, segments
 * séparés par `.`, chaque segment alphanum + tirets.
 */
export const BLOCK_KEY_REGEX = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

export class CreateContentBlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(BLOCK_KEY_REGEX, {
    message:
      "key doit être en notation pointée minuscule (ex: welcome.hero.title)",
  })
  key: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LOCALES as unknown as string[])
  locale?: ContentLocale;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  /** Texte court ou HTML court (sanitisé côté service). */
  @IsString()
  @MaxLength(20_000)
  body: string;

  /**
   * Données structurées libres (validation forte côté frontend selon la `key`).
   * Stockées en JSONB pour permettre les listes (services, FAQ items, etc.).
   */
  @IsOptional()
  data?: unknown;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
