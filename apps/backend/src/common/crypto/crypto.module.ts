import { Global, Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service";

/**
 * Module global qui expose CryptoService à toute l'app sans import explicite.
 * Voir crypto.service.ts pour la doc et le format des chiffrés.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
