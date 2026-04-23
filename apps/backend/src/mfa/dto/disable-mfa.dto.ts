import { IsOptional, IsString, MinLength, MaxLength } from "class-validator";

export class DisableMfaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  code?: string;
}
