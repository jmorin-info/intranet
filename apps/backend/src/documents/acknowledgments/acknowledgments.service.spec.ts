import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AcknowledgmentsService } from './acknowledgments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

/**
 * Attestation de lecture — snapshot d'identité (ISO 27001 A.5.28).
 *
 * Le contrat : la preuve doit rester exploitable APRÈS suppression du compte
 * (`DocumentAcknowledgment.user` est en `onDelete: SetNull`). Les colonnes
 * userEmail / userFirstName / userLastName / userRole doivent donc être
 * figées à l'instant du clic, en création COMME en mise à jour.
 */
describe('AcknowledgmentsService.acknowledge (snapshot identité)', () => {
  let service: AcknowledgmentsService;
  let prisma: any;
  let audit: any;

  const user = {
    email: 'jdoe@omnitech-security.fr',
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'COLLABORATEUR',
  };

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      document: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'doc-1', deletedAt: null }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      documentAcknowledgment: {
        upsert: jest.fn().mockResolvedValue({ id: 'ack-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcknowledgmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AcknowledgmentsService);
  });

  it('fige email / prénom / nom / rôle à la CRÉATION', async () => {
    await service.acknowledge('doc-1', 'user-1', '10.0.0.1', 'UA/1.0');

    const arg = prisma.documentAcknowledgment.upsert.mock.calls[0][0];
    expect(arg.create).toEqual(
      expect.objectContaining({
        documentId: 'doc-1',
        userId: 'user-1',
        ipAddress: '10.0.0.1',
        userAgent: 'UA/1.0',
        userEmail: 'jdoe@omnitech-security.fr',
        userFirstName: 'Jane',
        userLastName: 'Doe',
        userRole: 'COLLABORATEUR',
      }),
    );
  });

  it('rafraîchit aussi le snapshot à la MISE À JOUR (re-attestation)', async () => {
    await service.acknowledge('doc-1', 'user-1');

    const arg = prisma.documentAcknowledgment.upsert.mock.calls[0][0];
    expect(arg.update).toEqual(
      expect.objectContaining({
        userEmail: 'jdoe@omnitech-security.fr',
        userFirstName: 'Jane',
        userLastName: 'Doe',
        userRole: 'COLLABORATEUR',
        acknowledgedAt: expect.any(Date),
      }),
    );
  });

  it('sérialise le rôle en string (l’enum Prisma ne doit pas fuiter)', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, role: 'DIRECTION' });
    await service.acknowledge('doc-1', 'user-1');

    const arg = prisma.documentAcknowledgment.upsert.mock.calls[0][0];
    expect(typeof arg.create.userRole).toBe('string');
    expect(arg.create.userRole).toBe('DIRECTION');
  });

  it('refuse d’écrire une attestation sans identité résolvable', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.acknowledge('doc-1', 'ghost')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.documentAcknowledgment.upsert).not.toHaveBeenCalled();
  });

  it('refuse un document supprimé', async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      deletedAt: new Date(),
    });

    await expect(service.acknowledge('doc-1', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.documentAcknowledgment.upsert).not.toHaveBeenCalled();
  });

  it('trace l’attestation dans l’audit log avec IP/UA', async () => {
    await service.acknowledge('doc-1', 'user-1', '10.0.0.1', 'UA/1.0');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_ACKNOWLEDGED',
        resourceId: 'doc-1',
        ipAddress: '10.0.0.1',
        userAgent: 'UA/1.0',
      }),
    );
  });
});
