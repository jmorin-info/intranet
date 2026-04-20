import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatSurface } from '@prisma/client';
import { ChatContextDto } from './create-session.dto';

export class AskStreamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  query!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsEnum(ChatSurface)
  surface!: ChatSurface;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
