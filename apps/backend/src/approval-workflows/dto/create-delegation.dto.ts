import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { ApprovalDelegationScope, DocumentCategory } from "@prisma/client";

/**
 * DTO de création d'une délégation d'approbation manuelle.
 *
 * - `toUserId` : utilisateur destinataire (collègue, manager…). Différent de
 *   l'utilisateur courant.
 * - `startDate` / `endDate` : période ISO-8601 (YYYY-MM-DD ou full ISO).
 *   `endDate` doit être strictement postérieur à `startDate` (vérifié service).
 * - `scope=GLOBAL` (défaut) : toutes les approbations sont déléguées.
 * - `scope=SCOPED` + `categories[]` : uniquement les documents de ces
 *   catégories sont concernés (les autres restent sur l'utilisateur d'origine).
 *
 * Note : la délégation s'applique uniquement aux step-instances PENDING
 * créées pendant la fenêtre [startDate, endDate]. Une approbation déjà en
 * cours au moment de la création n'est PAS automatiquement re-routée — elle
 * est ré-évaluée seulement par le cron d'auto-délégation si elle dépasse le
 * SLA.
 */
export class CreateDelegationDto {
  @IsUUID()
  toUserId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsEnum(ApprovalDelegationScope)
  scope?: ApprovalDelegationScope;

  @IsOptional()
  @IsArray()
  @IsEnum(DocumentCategory, { each: true })
  categories?: DocumentCategory[];
}
