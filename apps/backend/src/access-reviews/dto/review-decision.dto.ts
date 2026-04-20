import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum ReviewDecision {
  KEEP = 'KEEP',
  REVOKE = 'REVOKE',
  CHANGE_ROLE = 'CHANGE_ROLE',
  CHANGE_DEPT = 'CHANGE_DEPT',
}

/**
 * DTO for submitting a decision on an individual AccessReview.
 * Matches AccessReviewsService.submitDecision signature.
 */
export class ReviewDecisionDto {
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comments?: string;
}
