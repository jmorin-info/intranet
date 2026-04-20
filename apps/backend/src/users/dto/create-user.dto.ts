import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  MinLength,
  Matches,
} from 'class-validator';
import { UserRole } from '../../common/enums';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12, { message: 'Minimum 12 caractères' })
  @Matches(/[A-Z]/, { message: 'Au moins une majuscule requise' })
  @Matches(/[a-z]/, { message: 'Au moins une minuscule requise' })
  @Matches(/[0-9]/, { message: 'Au moins un chiffre requis' })
  @Matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, { message: 'Au moins un caractère spécial requis' })
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
