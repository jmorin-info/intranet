import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { UserRole } from '../../common/enums';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Mode humour Noa — opt-in par utilisateur (admin peut le toggler depuis
  // /admin/users). Sans effet si feature.humor.noa est OFF.
  @IsOptional()
  @IsBoolean()
  noaEnabled?: boolean;
}
