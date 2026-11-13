import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  MinLength,
  Min,
} from "class-validator";
import { UserRole, WorkflowStepMode } from "@prisma/client";

/**
 * DTO d'ajout d'une étape à un workflow.
 *
 * Règle métier (ISO 27001 A.5.1) : une étape doit cibler EXACTEMENT UN type
 * d'approbateur parmi {rôle, utilisateur, département}. Cette contrainte est
 * vérifiée côté service (une validation XOR déclarative serait possible via
 * un validateur custom, mais la lisibilité souffre — on garde la logique
 * centralisée dans WorkflowsService.validateApproverSelector()).
 */
export class AddStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEnum(WorkflowStepMode)
  mode?: WorkflowStepMode;

  @IsOptional()
  @IsEnum(UserRole)
  approverRole?: UserRole;

  @IsOptional()
  @IsUUID()
  approverUserId?: string;

  @IsOptional()
  @IsUUID()
  approverDeptId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  slaHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  minApprovers?: number;

  @IsOptional()
  @IsUUID()
  escalateToUserId?: string;

  @IsOptional()
  @IsBoolean()
  autoApproveOnTimeout?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}
