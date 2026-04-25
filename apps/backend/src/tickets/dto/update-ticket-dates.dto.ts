import { IsOptional, IsDateString } from 'class-validator';

/**
 * DTO pour PATCH /tickets/:id/dates — dates metier (P1.10).
 *
 * Toutes les proprietes sont nullables :
 *  - undefined  -> on ne touche pas au champ
 *  - null       -> on efface la date (et l'event calendrier associe)
 *  - ISO string -> on met a jour
 *
 * class-validator ne distingue pas explicitement undefined et null, mais
 * @IsOptional + @IsDateString({ allowNull: true } via une transform au
 * niveau service suffit. On accepte aussi null en passant via class-validator
 * @ValidateIf.
 */
export class UpdateTicketDatesDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsDateString()
  clientShipmentDate?: string | null;

  @IsOptional()
  @IsDateString()
  materialReceivedDate?: string | null;

  @IsOptional()
  @IsDateString()
  deployedAt?: string | null;

  @IsOptional()
  @IsDateString()
  deploymentScheduledFor?: string | null;
}
