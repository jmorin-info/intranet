import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsString()
  category?: string;

  // NOTE: Prisma TicketPriority enum uses MEDIUM (not NORMAL).
  // We accept both NORMAL (spec) and MEDIUM for backward compat, but only
  // the Prisma-valid values will pass DB write.
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /**
   * Department responsible for the ticket. If omitted, the creator's
   * primary department is used (see TicketsService.create).
   */
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  /**
   * Space (domain) for the ticket. If omitted, the default space is used
   * (typically "IT"). Enables multi-space ticketing (IT, RH, Services
   * Generaux, etc.).
   */
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
