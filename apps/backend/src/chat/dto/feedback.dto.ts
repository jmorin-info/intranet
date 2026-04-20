import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ChatFeedbackRating, ChatFeedbackReason } from '@prisma/client';

export class FeedbackDto {
  @IsEnum(ChatFeedbackRating)
  rating!: ChatFeedbackRating;

  @IsOptional()
  @IsEnum(ChatFeedbackReason)
  reason?: ChatFeedbackReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
