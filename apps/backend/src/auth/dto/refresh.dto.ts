import { IsString, IsOptional } from 'class-validator';

export class RefreshDto {
  // TODO: Retirer le fallback body le 2026-05-16 — le refresh token doit venir uniquement du cookie httpOnly.
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
