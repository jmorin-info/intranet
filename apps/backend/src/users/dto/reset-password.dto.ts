import { IsString, MinLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(12, { message: 'Minimum 12 caractères' })
  @Matches(/[A-Z]/, { message: 'Au moins une majuscule requise' })
  @Matches(/[a-z]/, { message: 'Au moins une minuscule requise' })
  @Matches(/[0-9]/, { message: 'Au moins un chiffre requis' })
  @Matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, { message: 'Au moins un caractère spécial requis' })
  newPassword: string;
}
