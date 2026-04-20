import { IsUUID, IsOptional, IsInt } from 'class-validator';

export class CreateSignatureDto {
  @IsUUID()
  documentVersionId: string;

  @IsUUID()
  signerId: string;

  @IsOptional()
  @IsInt()
  templateId?: number;
}
