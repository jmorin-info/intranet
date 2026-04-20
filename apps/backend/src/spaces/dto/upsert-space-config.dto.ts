import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';

const SCOPE_TYPES = ['GLOBAL', 'DEPARTMENT', 'ROLE'] as const;
type ScopeType = (typeof SCOPE_TYPES)[number];

export class UpsertSpaceConfigDto {
  @IsString()
  module: string;

  @IsEnum(SCOPE_TYPES)
  scopeType: ScopeType;

  @IsOptional()
  @IsString()
  scopeValue?: string;

  @IsBoolean()
  enabled: boolean;
}
