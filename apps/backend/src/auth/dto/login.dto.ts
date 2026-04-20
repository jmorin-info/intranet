import { IsEmail, IsString, IsOptional, MinLength, Length } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  mfaCode?: string;
}
