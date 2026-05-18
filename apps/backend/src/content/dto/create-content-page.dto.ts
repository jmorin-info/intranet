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

export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type ContentLocale = (typeof SUPPORTED_LOCALES)[number];

/** Slug : lowercase alphanum + tirets, 1..120 chars, sans tiret en bord. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateContentPageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  /**
   * Optional. Si absent, généré côté service via `generateUniqueSlug(title)`.
   * Si fourni, doit respecter le SLUG_REGEX et rester unique pour la locale.
   */
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
  @IsIn(SUPPORTED_LOCALES as unknown as string[])
  locale?: ContentLocale;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  /** HTML rich text — sanitisé côté service via sanitizeRichText avant DB. */
  @IsString()
  @MaxLength(200_000)
  content: string;

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
}
