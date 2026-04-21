import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum MediaVisibilityDto {
  INTERNAL = 'INTERNAL',
  DEPARTMENT = 'DEPARTMENT',
  PRIVATE = 'PRIVATE',
}

export class CreateAlbumDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(MediaVisibilityDto)
  visibility?: MediaVisibilityDto;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

export class UpdateAlbumDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(MediaVisibilityDto)
  visibility?: MediaVisibilityDto;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  coverItemId?: string | null;
}

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
