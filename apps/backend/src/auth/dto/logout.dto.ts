import { IsOptional, IsString } from 'class-validator';

/**
 * DTO pour POST /auth/logout.
 * Le refreshToken est optionnel : on veut qu'un logout réussisse toujours
 * côté serveur (nettoyage best-effort) même si le frontend n'a plus son token en mémoire.
 */
export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
