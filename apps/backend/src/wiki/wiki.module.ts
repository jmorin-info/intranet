import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MentionsModule } from "../mentions/mentions.module";
import { RagModule } from "../rag/rag.module";
import { MeilisearchModule } from "../search/meilisearch.module";
import { WikiController } from "./wiki.controller";
import { WikiService } from "./wiki.service";
import { BacklinkService } from "./backlink.service";
import { WikiTagService } from "./wiki-tag.service";

@Module({
  imports: [PrismaModule, MentionsModule, RagModule, MeilisearchModule],
  controllers: [WikiController],
  providers: [WikiService, BacklinkService, WikiTagService],
  exports: [WikiService, BacklinkService, WikiTagService],
})
export class WikiModule {}
