import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  MaxLength,
  Matches,
  ValidateNested,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";
import { DocumentCategory } from "@prisma/client";
import { TemplateVariableDto } from "./template-variable.dto";

export class CreateDocumentTemplateDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  // slug : kebab-case, alphanumérique + tirets uniquement (idempotent côté URL)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: "slug must be kebab-case (a-z, 0-9, -)",
  })
  @MaxLength(80)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(DocumentCategory)
  category: DocumentCategory;

  @IsString()
  @MaxLength(500_000)
  content: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  variables: TemplateVariableDto[];

  @IsOptional()
  @IsString()
  classification?: string; // PUBLIC | INTERNE | CONFIDENTIEL | SECRET
}
