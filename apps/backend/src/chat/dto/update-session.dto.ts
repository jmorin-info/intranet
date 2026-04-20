import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSessionDto {
  /** Rename the session (displayed in the sidebar history). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /**
   * Archive / unarchive. Setting `true` stamps `archivedAt = now()`; `false`
   * clears it. Leaving undefined = no-op on the archive state.
   */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
