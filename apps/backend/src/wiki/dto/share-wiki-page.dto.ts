import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { WIKI_VISIBILITIES, WikiVisibility } from './create-wiki-page.dto';

export class ShareWikiPageDto {
  @IsOptional()
  @IsIn(WIKI_VISIBILITIES)
  visibility?: WikiVisibility;

  @IsOptional()
  @IsUUID()
  ownerDepartmentId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedRoles?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  collaborators?: string[];
}
