import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsEnum,
  IsUUID,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../common/enums';

/**
 * Visibilité d'un SavedFilter (F3 — partage de filtres, 2026-04-28).
 *
 * - PRIVATE    : visible uniquement par l'auteur (default — comportement historique)
 * - DEPARTMENT : visible par tous les users du département `sharedWithDepartmentId`
 * - ROLE       : visible par tous les users avec le rôle `sharedWithRole`
 * - PUBLIC     : visible par tous les users authentifiés
 */
export enum SavedFilterVisibility {
  PRIVATE = 'PRIVATE',
  DEPARTMENT = 'DEPARTMENT',
  ROLE = 'ROLE',
  PUBLIC = 'PUBLIC',
}

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

  /**
   * Visibilité du filtre. Default = PRIVATE → comportement legacy.
   */
  @IsOptional()
  @IsEnum(SavedFilterVisibility)
  visibility?: SavedFilterVisibility;

  /**
   * Requis quand visibility === DEPARTMENT.
   */
  @ValidateIf((o) => o.visibility === SavedFilterVisibility.DEPARTMENT)
  @IsUUID()
  sharedWithDepartmentId?: string;

  /**
   * Requis quand visibility === ROLE.
   */
  @ValidateIf((o) => o.visibility === SavedFilterVisibility.ROLE)
  @IsEnum(UserRole)
  sharedWithRole?: UserRole;
}
