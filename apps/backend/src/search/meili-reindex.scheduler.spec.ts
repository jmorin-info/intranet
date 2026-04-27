import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MeiliReindexScheduler } from './meili-reindex.scheduler';
import { MeilisearchService } from './meilisearch.service';

/**
 * Tests unitaires de `MeiliReindexScheduler` — verifie le cron nightly.
 *
 * On ne teste pas le declenchement reel par @nestjs/schedule (cela necessiterait
 * un fake-timer + ScheduleModule.forRoot()), on appelle directement la methode
 * `reindexNightly()` et on verifie son contrat :
 *   - skip si Meilisearch desactive
 *   - delegue a meili.reindexAll() sinon
 *   - logge le resultat
 *   - tolere les erreurs (ne throw pas)
 */
describe('MeiliReindexScheduler', () => {
  let scheduler: MeiliReindexScheduler;
  let meiliMock: {
    isEnabled: jest.Mock;
    reindexAll: jest.Mock;
  };

  beforeEach(async () => {
    meiliMock = {
      isEnabled: jest.fn(),
      reindexAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeiliReindexScheduler,
        { provide: MeilisearchService, useValue: meiliMock },
      ],
    }).compile();

    scheduler = module.get<MeiliReindexScheduler>(MeiliReindexScheduler);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('reindexNightly', () => {
    it('skip si Meilisearch est desactive', async () => {
      meiliMock.isEnabled.mockReturnValue(false);
      await scheduler.reindexNightly();
      expect(meiliMock.reindexAll).not.toHaveBeenCalled();
    });

    it('appelle reindexAll si Meilisearch est actif', async () => {
      meiliMock.isEnabled.mockReturnValue(true);
      meiliMock.reindexAll.mockResolvedValue({
        documents: 16,
        tickets: 368,
        wiki: 65,
        news: 8,
        runbooks: 2,
      });

      await scheduler.reindexNightly();

      expect(meiliMock.reindexAll).toHaveBeenCalledTimes(1);
    });

    it('logge le decompte par index apres succes', async () => {
      meiliMock.isEnabled.mockReturnValue(true);
      const summary = {
        documents: 5,
        tickets: 10,
        wiki: 3,
        news: 1,
        runbooks: 0,
      };
      meiliMock.reindexAll.mockResolvedValue(summary);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await scheduler.reindexNightly();

      // Au moins le log "start" + le log "done" avec le decompte
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('meili.reindex.nightly.start'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('meili.reindex.nightly.done'),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"documents":5'),
      );
    });

    it('ne throw pas si reindexAll echoue (logge l\'erreur)', async () => {
      meiliMock.isEnabled.mockReturnValue(true);
      meiliMock.reindexAll.mockRejectedValue(new Error('Meili down'));
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await expect(scheduler.reindexNightly()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          msg: 'meili.reindex.nightly.failed',
          error: 'Meili down',
        }),
      );
    });
  });
});
