import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";
import { DocumentCategory } from "@prisma/client";
import { TemplateVariableDto } from "./template-variable.dto";

/**
 * Slug est volontairement immuable après création (référence stable utilisée
 * dans des liens externes). Pour le renommer : créer un nouveau template +
 * archiver l'ancien.
 */
export class UpdateDocumentTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  variables?: TemplateVariableDto[];

  @IsOptional()
  @IsString()
  classification?: string;
}
