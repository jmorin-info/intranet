import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IT_EXPORT_CATEGORY_CODES } from '../it-export-categories.constants';

/**
 * Payload for POST /it-exports/upload (multipart form).
 *
 * The actual file is sent via the `file` field and parsed by
 * FileInterceptor; this DTO validates the sibling text fields.
 */
export class UploadItExportDto {
  @IsString()
  @IsIn(IT_EXPORT_CATEGORY_CODES, {
    message: `category must be one of: ${IT_EXPORT_CATEGORY_CODES.join(', ')}`,
  })
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /**
   * Free-form period label: 'monthly', '2026-01', 'Q1-2026', '2026',
   * 'ad-hoc', etc. Kept as string for maximum flexibility.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reportPeriod?: string;

  /**
   * Tags arrive as JSON string via multipart form, so we transform them
   * here before the @IsArray validation kicks in.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fallback: comma-separated list
        return value
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }
    return undefined;
  })
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
