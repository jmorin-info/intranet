import { Controller, Get, Post, Body, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AiService } from "./ai.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";

// Endpoints IA — coûteux en GPU/CPU + accès à du contexte interne.
// Réservé COLLABORATEUR+ : un PRESTATAIRE externe ne doit pas lancer
// des requêtes LLM sur les données de l'intranet.
@Controller("ai")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COLLABORATEUR)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get("search")
  async smartSearch(
    @Query("q") query: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!query || query.trim().length < 2) {
      return {
        documents: [],
        wiki: [],
        tickets: [],
        news: [],
        suggestions: ["Tapez au moins 2 caractères"],
      };
    }
    return this.aiService.smartSearch(query, user.id, user.role);
  }

  @Post("analyze-ticket")
  async analyzeTicket(
    @Body() body: { title: string; description: string; category: string },
  ) {
    return this.aiService.analyzeTicket(
      body.title,
      body.description || "",
      body.category || "",
    );
  }

  @Get("recommendations")
  async getRecommendations(@CurrentUser() user: RequestUser) {
    return this.aiService.getRecommendations(user.id);
  }

  @Post("categorize")
  async categorize(@Body() body: { text: string }) {
    return this.aiService.categorizeContent(body.text || "");
  }

  /** AI-powered UX insights — personalized suggestions based on usage patterns */
  @Get("ux-insights")
  async getUxInsights(@CurrentUser() user: RequestUser) {
    return this.aiService.generateUxInsights(user.id, user.role);
  }
}
