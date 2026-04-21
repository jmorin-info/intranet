import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { TicketSpacePermission } from '@prisma/client';

/**
 * Add a member to a space. EXACTLY ONE of { userId, role, departmentId }
 * must be provided (enforced in service).
 */
export class AddMemberDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(['COLLABORATEUR', 'REVIEWER', 'AUDITEUR', 'DIRECTION', 'ADMIN', 'SUPER_ADMIN', 'PRESTATAIRE'])
  role?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsEnum(TicketSpacePermission)
  permission!: TicketSpacePermission;
}

export class UpdateMemberDto {
  @IsEnum(TicketSpacePermission)
  permission!: TicketSpacePermission;
}
