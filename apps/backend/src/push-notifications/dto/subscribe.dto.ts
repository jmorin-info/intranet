import { IsString, IsObject, IsOptional, IsIn, ValidateNested } from 'class-validator';
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

  /**
   * Indice explicite de plateforme fourni par le frontend (plus fiable
   * que le User-Agent côté backend, car le frontend peut interroger
   * matchMedia + 'standalone' in navigator). Valeurs autorisées :
   *   - 'ios'     : Safari iOS / iPadOS (PWA installée)
   *   - 'macos'   : Safari macOS
   *   - 'android' : Chrome / Firefox / Samsung Internet sur Android
   *   - 'desktop' : Chrome / Firefox / Edge sur desktop
   *   - 'unknown' : non déterminé
   */
  @IsString()
  @IsOptional()
  @IsIn(['ios', 'macos', 'android', 'desktop', 'unknown'])
  platform?: string;
}

export class UnsubscribeDto {
  @IsString()
  endpoint!: string;
}
