import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * DTO pour POST /auth/reset-password.
 * La politique de complexité complète est vérifiée côté service (AuthService.resetPasswordWithToken)
 * afin de renvoyer un message détaillé listant toutes les règles manquantes.
 * Ici on ne fait qu'une validation minimale pour éviter un 400 ValidationPipe sur un payload vide.
 */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'token manquant' })
  token: string;

  @IsString()
  @MinLength(1, { message: 'password manquant' })
  password: string;
}
