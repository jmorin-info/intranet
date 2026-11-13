import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";

/**
 * DTO pour POST /fileserver/authenticate.
 * Avant ce DTO, le controller acceptait un type TS inline (`{ username, password }`),
 * non reconnu par le ValidationPipe global (whitelist/forbidNonWhitelisted, cf. main.ts) —
 * username/password transitaient donc sans aucune validation jusqu'à la commande smbclient.
 */
export class AuthenticateFileserverDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;
}

/**
 * DTO pour POST /fileserver/mkdir/:share. Même raison que ci-dessus : sans DTO
 * class-validator, `@Body() { path, name }` inline échappe au ValidationPipe
 * global — path/name arrivaient non validés jusqu'à la commande smbclient.
 * La validation métier fine (métacaractères) reste dans createFolder().
 */
export class CreateFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  path?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;
}
