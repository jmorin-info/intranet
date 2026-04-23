import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  IsDateString,
  MaxLength,
  Matches,
} from "class-validator";

const BANNER_LEVELS = ["P1", "P2", "P3"] as const;

// Accepte : URL absolue (http/https) OU chemin interne commençant par /
// Refuse : javascript:, data:, schémas exotiques (XSS / open redirect).
const LINK_URL_REGEX = /^(?:https?:\/\/[^\s]+|\/[^\s]*)$/i;

export class CreateBannerDto {
  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(5)
  message: string;

  @IsOptional()
  @IsEnum(BANNER_LEVELS)
  level?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Matches(LINK_URL_REGEX, {
    message:
      "linkUrl doit être une URL absolue (http/https) ou un chemin interne (/...)",
  })
  linkUrl?: string;
}
