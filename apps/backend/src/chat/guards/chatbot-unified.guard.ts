import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';

/**
 * Chatbot unified architecture guard.
 *
 * Gate globally all /chat/* endpoints behind the CHATBOT_UNIFIED_ENABLED
 * feature flag (default: false). When disabled, the endpoints return 404
 * (rather than 403) so the existence of the unified architecture is not
 * disclosed before it's ready for production.
 *
 * Pattern aligned with the rest of the project which reads process.env
 * directly (see RagService.isEnabled() for reference).
 *
 * Refs: Mission 3 Phase 1 — fusion chatbots backend unifié.
 */
@Injectable()
export class ChatbotUnifiedGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!isChatbotUnifiedEnabled()) {
      // 404 rather than 403 to avoid disclosing the endpoint's existence.
      throw new NotFoundException();
    }
    return true;
  }
}

/**
 * Centralized env read so the flag can be inspected from services/tests
 * with the same semantics as the guard.
 */
export function isChatbotUnifiedEnabled(): boolean {
  const raw = process.env.CHATBOT_UNIFIED_ENABLED;
  return raw === 'true' || raw === '1';
}
