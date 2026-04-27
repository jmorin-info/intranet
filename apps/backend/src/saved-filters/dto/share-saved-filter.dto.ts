import {
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../common/enums';
import { SavedFilterVisibility } from './create-saved-filter.dto';

/**
 * Body de PATCH /saved-filters/:id/share — modifie la visibilité d'un filtre.
 * Pour repasser en PRIVATE (révocation), envoyer `{ visibility: PRIVATE }`.
 */
export class ShareSavedFilterDto {
  @IsEnum(SavedFilterVisibility)
  visibility: SavedFilterVisibility;

  @ValidateIf((o) => o.visibility === SavedFilterVisibility.DEPARTMENT)
  @IsUUID()
  sharedWithDepartmentId?: string;

  @ValidateIf((o) => o.visibility === SavedFilterVisibility.ROLE)
  @IsEnum(UserRole)
  sharedWithRole?: UserRole;
}

/**
 * Body de PATCH /saved-filters/:id — mise à jour partielle (name + isDefault).
 */
export class UpdateSavedFilterDto {
  @IsOptional()
  name?: string;

  @IsOptional()
  isDefault?: boolean;
}
