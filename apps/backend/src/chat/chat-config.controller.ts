import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { isChatbotUnifiedEnabled } from "./guards/chatbot-unified.guard";

/**
 * Configuration publique (authentifiée) du chatbot.
 *
 * Volontairement HORS du ChatbotUnifiedGuard : le frontend interroge cette
 * route au montage du widget pour savoir s'il doit utiliser le backend
 * unifié /chat/* (sessions persistées, streaming) ou le flux historique
 * /rag/ask-stream. Quand le flag CHATBOT_UNIFIED_ENABLED est absent/false,
 * la route répond { unified: false } (les autres routes /chat/* restent 404).
 */
@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatConfigController {
  @Get("config")
  getConfig(): { unified: boolean } {
    return { unified: isChatbotUnifiedEnabled() };
  }
}
