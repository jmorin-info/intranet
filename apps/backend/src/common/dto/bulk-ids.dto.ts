import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
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
