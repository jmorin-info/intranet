import { IsBooleanString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ChatSurface } from '@prisma/client';

export class ListSessionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** 'true' | 'false' — filter on archivedAt presence. */
  @IsOptional()
  @IsBooleanString()
  archived?: string;

  @IsOptional()
  @IsEnum(ChatSurface)
  surface?: ChatSurface;
}
