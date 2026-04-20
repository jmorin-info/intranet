import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatSurface } from '@prisma/client';

/**
 * Context optionnel d'ouverture d'une session (contexte de page pour le FAB).
 * Tous les champs sont optionnels ; le contexte est purement informatif
 * (utilisé côté serveur pour enrichir le prompt LLM si présent).
 */
export class ChatContextDto {
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  url?: string;

  /** Ex: 'wiki_article', 'ticket', 'document', 'generic'. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contextType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  entityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}

export class CreateSessionDto {
  @IsEnum(ChatSurface)
  surface!: ChatSurface;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
