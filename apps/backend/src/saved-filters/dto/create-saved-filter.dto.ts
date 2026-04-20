import { IsString, IsOptional, IsBoolean, IsObject, MinLength, MaxLength } from 'class-validator';

export class CreateSavedFilterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  module: string;

  @IsObject()
  filters: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
