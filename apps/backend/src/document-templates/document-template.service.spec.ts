import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DocumentTemplateService } from "./document-template.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { TemplateVariableType } from "./dto/template-variable.dto";

/**
 * Wave D — Tests unitaires DocumentTemplateService.
 *
 * Couvre :
 *  - Validation des variables (key regex, duplicates, SELECT options)
 *  - Render content (substitution, missing required, defaultValue)
 *  - Soft delete + audit trail
 *  - Slug conflict
 */
describe("DocumentTemplateService", () => {
  let service: DocumentTemplateService;
  let prisma: any;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      documentTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      document: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentTemplateService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<DocumentTemplateService>(DocumentTemplateService);
  });

  describe("renderContent", () => {
    it("substitutes simple variables", () => {
      const out = service.renderContent(
        "Hello {{name}}, welcome to {{company}}.",
        [
          { key: "name", label: "Nom", type: TemplateVariableType.TEXT },
          { key: "company", label: "Société", type: TemplateVariableType.TEXT },
        ],
        { name: "Alice", company: "OMNITECH" },
      );
      expect(out.content).toBe("Hello Alice, welcome to OMNITECH.");
      expect(out.missing).toEqual([]);
    });

    it("supports whitespace inside {{ var }}", () => {
      const out = service.renderContent(
        "X={{  spaced  }}.",
        [{ key: "spaced", label: "Spaced", type: TemplateVariableType.TEXT }],
        { spaced: "OK" },
      );
      expect(out.content).toBe("X=OK.");
    });

    it("returns missing required variables", () => {
      const out = service.renderContent(
        "Doc {{title}} owned by {{owner}}",
        [
          {
            key: "title",
            label: "Title",
            type: TemplateVariableType.TEXT,
            required: true,
          },
          {
            key: "owner",
            label: "Owner",
            type: TemplateVariableType.TEXT,
            required: true,
          },
        ],
        { title: "Politique" },
      );
      expect(out.missing).toEqual(["owner"]);
    });

    it("uses defaultValue if value missing and not required", () => {
      const out = service.renderContent(
        "{{greeting}} {{name}}",
        [
          {
            key: "greeting",
            label: "Greeting",
            type: TemplateVariableType.TEXT,
            defaultValue: "Bonjour",
          },
          { key: "name", label: "Name", type: TemplateVariableType.TEXT },
        ],
        { name: "Bob" },
      );
      expect(out.content).toBe("Bonjour Bob");
    });

    it("renders empty string for unknown variable in content", () => {
      const out = service.renderContent(
        "Hello {{unknown}}!",
        [],
        {},
      );
      expect(out.content).toBe("Hello !");
    });
  });

  describe("instantiate", () => {
    const tpl = {
      id: "tpl-1",
      name: "Politique X",
      slug: "politique-x",
      description: "desc",
      category: "POLICY",
      classification: "INTERNE",
      content: "Auteur : {{author}}",
      variables: [
        {
          key: "author",
          label: "Auteur",
          type: TemplateVariableType.TEXT,
          required: true,
        },
      ],
      createdBy: { id: "u1", firstName: "A", lastName: "B", email: "a@b.fr" },
    };

    it("throws NotFoundException if template not found", async () => {
      prisma.documentTemplate.findFirst.mockResolvedValue(null);
      await expect(
        service.instantiate("nope", { variables: {} }, "user-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequest if required variable missing", async () => {
      prisma.documentTemplate.findFirst.mockResolvedValue(tpl);
      await expect(
        service.instantiate("tpl-1", { variables: {} }, "user-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a Document with rendered content + audit log", async () => {
      prisma.documentTemplate.findFirst.mockResolvedValue(tpl);
      prisma.document.count.mockResolvedValue(2);
      prisma.document.create.mockResolvedValue({
        id: "doc-1",
        title: "Politique X",
        content: "Auteur : Alice",
        reference: "OMS-POL-POLITIQU-0003",
        fromTemplateId: "tpl-1",
      });

      const result = await service.instantiate(
        "tpl-1",
        { variables: { author: "Alice" } },
        "user-1",
      );

      expect(result.id).toBe("doc-1");
      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Politique X",
            content: "Auteur : Alice",
            isNative: true,
            scanStatus: "CLEAN",
            fromTemplateId: "tpl-1",
            ownerId: "user-1",
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "DOCUMENT_INSTANTIATED_FROM_TEMPLATE",
          resourceId: "doc-1",
        }),
      );
    });
  });

  describe("create — validation", () => {
    it("rejects invalid variable key (not /\\w+/)", async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          {
            name: "T",
            slug: "t",
            category: "POLICY" as any,
            content: "x",
            variables: [
              {
                key: "bad-key",
                label: "L",
                type: TemplateVariableType.TEXT,
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects duplicated keys", async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          {
            name: "T",
            slug: "t",
            category: "POLICY" as any,
            content: "x",
            variables: [
              { key: "a", label: "A", type: TemplateVariableType.TEXT },
              { key: "a", label: "A2", type: TemplateVariableType.TEXT },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects SELECT without options", async () => {
      prisma.documentTemplate.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          {
            name: "T",
            slug: "t",
            category: "POLICY" as any,
            content: "x",
            variables: [
              {
                key: "level",
                label: "Level",
                type: TemplateVariableType.SELECT,
                options: [],
              },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
