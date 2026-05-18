import { IsString, IsOptional, IsEnum, MaxLength } from "class-validator";
import { ContentStatus } from "@prisma/client";

/**
 * Patch d'un ContentBlock. La clé et la locale ne sont jamais modifiables
 * (créer un nouveau bloc si besoin). Tous les autres champs sont patchables.
 */
export class UpdateContentBlockDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  body?: string;

  @IsOptional()
  data?: unknown;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
