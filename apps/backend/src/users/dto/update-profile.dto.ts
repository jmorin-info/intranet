import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  skills?: string; // JSON array string

  @IsOptional()
  @IsString()
  languages?: string; // JSON array string

  @IsOptional()
  @IsString()
  teamsLink?: string;

  // Opt-in mode humour Noa via /profile (l'utilisateur lui-même).
  @IsOptional()
  @IsBoolean()
  noaEnabled?: boolean;
}
