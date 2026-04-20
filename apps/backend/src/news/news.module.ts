import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MentionsModule } from '../mentions/mentions.module';
import { MeilisearchModule } from '../search/meilisearch.module';

@Module({
  imports: [NotificationsModule, MentionsModule, MeilisearchModule],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
