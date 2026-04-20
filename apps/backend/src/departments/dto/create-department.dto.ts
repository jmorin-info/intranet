import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_-]+$/i, {
    message: 'Code must contain only alphanumeric characters, hyphens, and underscores',
  })
  code: string;
}
