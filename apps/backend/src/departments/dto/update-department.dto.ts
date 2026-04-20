import { IsString, IsOptional, IsNotEmpty, Matches } from 'class-validator';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_-]+$/i, {
    message: 'Code must contain only alphanumeric characters, hyphens, and underscores',
  })
  code?: string;
}
