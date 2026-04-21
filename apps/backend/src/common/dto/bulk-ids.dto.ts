import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

/**
 * Shared DTOs for bulk operations.
 * Enforces bounded array size (max 100) to prevent abuse / DoS.
 */
export class BulkIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];
}

export class BulkStatusDto extends BulkIdsDto {
  @IsString()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'])
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';
}

export class BulkAssignDto extends BulkIdsDto {
  /** `null` to unassign. String must be a UUID. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('4')
  assigneeId: string | null;
}

export class BulkClassificationDto extends BulkIdsDto {
  @IsString()
  @IsIn(['PUBLIC', 'INTERNE', 'CONFIDENTIEL', 'SECRET'])
  classification: 'PUBLIC' | 'INTERNE' | 'CONFIDENTIEL' | 'SECRET';
}
