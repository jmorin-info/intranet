import { IsArray, IsString, ArrayUnique } from 'class-validator';

/**
 * Payload de mise à jour de la configuration d'accès modules pour un
 * département. On remplace atomiquement la liste des modules activés pour
 * le scope DEPARTMENT = :id.
 *
 * - modules : codes canoniques (cf. AVAILABLE_MODULES). Tous les modules
 *   absents de la liste seront considérés "non activés spécifiquement" et
 *   retomberont sur la règle globale/rôle (cf. SpacesService.getModulesForUser).
 */
export class UpdateDepartmentAccessConfigDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  modules: string[];
}
