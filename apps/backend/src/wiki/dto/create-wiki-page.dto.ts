import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const WIKI_VISIBILITIES = ['PRIVATE', 'DEPARTMENT', 'ROLE', 'PUBLIC'] as const;
export type WikiVisibility = (typeof WIKI_VISIBILITIES)[number];

export class CreateWikiPageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  // Slug optionnel : auto-généré depuis title si absent (slugify util).
  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsIn(WIKI_VISIBILITIES)
  visibility?: WikiVisibility;

  @IsOptional()
  @IsUUID()
  ownerDepartmentId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedRoles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  collaborators?: string[];
}

export class UpdateWikiPageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  changeLog?: string;
}
