import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * DTO for granting access to an existing PRESTATAIRE user.
 * Matches the ExternalAccessService.grantAccess signature.
 */
export class GrantAccessDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  contractRef: string;

  @IsOptional()
  @IsDateString()
  accessExpiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  sessionTimeout?: number;
}

/**
 * DTO for creating a brand-new PRESTATAIRE account (user + ExternalAccess).
 * Matches the ExternalAccessService.createPrestaAccount signature.
 */
export class CreatePrestaAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contractRef?: string;

  @IsOptional()
  @IsDateString()
  accessExpiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  sessionTimeout?: number;
}
