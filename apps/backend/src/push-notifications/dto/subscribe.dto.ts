import { IsString, IsObject, IsOptional, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PushKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class SubscribeDto {
  @IsString()
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;

  @IsString()
  @IsOptional()
  userAgent?: string;
}

export class UnsubscribeDto {
  @IsString()
  endpoint!: string;
}
