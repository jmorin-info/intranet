import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  ValidateNested,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";

export enum TemplateVariableType {
  TEXT = "TEXT",
  DATE = "DATE",
  NUMBER = "NUMBER",
  SELECT = "SELECT",
}

/**
 * Spec d'une variable d'un DocumentTemplate.
 * Stockée dans `DocumentTemplate.variables` (JSON Array<TemplateVariableDto>).
 *
 * - `key` : identifiant utilisé dans le template (`{{key}}`).
 * - `type` : pilote le contrôle frontend (input text/date/number/select).
 * - `required` : si true, l'instanciation refuse une valeur vide.
 * - `defaultValue` : pré-rempli côté UI.
 * - `options` : valeurs autorisées pour `SELECT` (sinon ignoré).
 */
export class TemplateVariableDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsEnum(TemplateVariableType)
  type: TemplateVariableType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  options?: string[];
}

/**
 * Représentation runtime d'une variable, validée et utilisée par le service.
 * Sert également de type pour le json côté Prisma.
 */
export interface TemplateVariableSpec {
  key: string;
  label: string;
  type: TemplateVariableType;
  required?: boolean;
  defaultValue?: string;
  options?: string[];
}
