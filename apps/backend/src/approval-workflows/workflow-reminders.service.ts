import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WorkflowRuntimeService } from './workflow-runtime.service';

@Injectable()
export class WorkflowRemindersService {
  private readonly logger = new Logger(WorkflowRemindersService.name);
  private running = false;
  constructor(private readonly runtime: WorkflowRuntimeService) {}

  @Cron('0 9 * * 1-5', { timeZone: 'Europe/Paris' })
  async remind() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.runtime.remindOverdue();
      this.logger.log(`Relances d’approbation : ${result.sent} notification(s), ${result.examined} circuit(s) examinés.`);
      return result;
    } catch (error) {
      this.logger.error('Échec des relances d’approbation', error instanceof Error ? error.stack : undefined);
    } finally { this.running = false; }
  }
}
