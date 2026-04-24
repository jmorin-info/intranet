import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { UserRole } from '../../common/enums';

export interface UserRow {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department?: string;
  jobTitle?: string;
  phone?: string;
}

export interface CsvValidationError {
  line: number;
  field: string;
  message: string;
}

export interface CsvValidationResult {
  valid: UserRow[];
  errors: CsvValidationError[];
}

export interface CsvImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

const VALID_ROLES = Object.values(UserRole);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private detectSeparator(firstLine: string): string {
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    return semicolonCount >= commaCount ? ';' : ',';
  }

  private normalizeHeader(header: string): string {
    return header.trim().toLowerCase().replace(/['"]/g, '');
  }

  async parseAndValidate(file: Express.Multer.File): Promise<CsvValidationResult> {
    const content = file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      return { valid: [], errors: [{ line: 1, field: 'file', message: 'Le fichier doit contenir au moins un en-tete et une ligne de donnees' }] };
    }

    const separator = this.detectSeparator(lines[0]);
    const headers = lines[0].split(separator).map((h) => this.normalizeHeader(h));

    const emailIdx = headers.indexOf('email');
    const firstNameIdx = headers.indexOf('firstname');
    const lastNameIdx = headers.indexOf('lastname');
    const roleIdx = headers.indexOf('role');
    const departmentIdx = headers.indexOf('department');
    const jobTitleIdx = headers.indexOf('jobtitle');
    const phoneIdx = headers.indexOf('phone');

    if (emailIdx === -1 || firstNameIdx === -1 || lastNameIdx === -1) {
      return {
        valid: [],
        errors: [{ line: 1, field: 'headers', message: 'Colonnes obligatoires manquantes : email, firstName, lastName' }],
      };
    }

    const valid: UserRow[] = [];
    const errors: CsvValidationError[] = [];

    // Preload existing emails for fast lookup
    const existingUsers = await this.prisma.user.findMany({
      select: { email: true },
      where: { deletedAt: null },
    });
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    // Preload departments
    const departments = await this.prisma.department.findMany({
      select: { id: true, name: true },
    });
    const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));

    const seenEmails = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const lineNum = i + 1;

      const email = (cols[emailIdx] || '').trim().toLowerCase();
      const firstName = (cols[firstNameIdx] || '').trim();
      const lastName = (cols[lastNameIdx] || '').trim();
      const roleRaw = roleIdx !== -1 ? (cols[roleIdx] || '').trim().toUpperCase() : '';
      const department = departmentIdx !== -1 ? (cols[departmentIdx] || '').trim() : '';
      const jobTitle = jobTitleIdx !== -1 ? (cols[jobTitleIdx] || '').trim() : '';
      const phone = phoneIdx !== -1 ? (cols[phoneIdx] || '').trim() : '';

      let hasError = false;

      if (!email) {
        errors.push({ line: lineNum, field: 'email', message: 'Email requis' });
        hasError = true;
      } else if (!EMAIL_REGEX.test(email)) {
        errors.push({ line: lineNum, field: 'email', message: 'Email invalide' });
        hasError = true;
      } else if (existingEmails.has(email)) {
        errors.push({ line: lineNum, field: 'email', message: 'Email deja existant en base' });
        hasError = true;
      } else if (seenEmails.has(email)) {
        errors.push({ line: lineNum, field: 'email', message: 'Email en doublon dans le fichier' });
        hasError = true;
      }

      if (!firstName) {
        errors.push({ line: lineNum, field: 'firstName', message: 'Prenom requis' });
        hasError = true;
      }

      if (!lastName) {
        errors.push({ line: lineNum, field: 'lastName', message: 'Nom requis' });
        hasError = true;
      }

      const role = roleRaw && VALID_ROLES.includes(roleRaw as UserRole)
        ? (roleRaw as UserRole)
        : UserRole.COLLABORATEUR;

      if (roleRaw && !VALID_ROLES.includes(roleRaw as UserRole)) {
        errors.push({ line: lineNum, field: 'role', message: `Role invalide : ${roleRaw}. Valeurs acceptees : ${VALID_ROLES.join(', ')}` });
        hasError = true;
      }

      if (department && !deptMap.has(department.toLowerCase())) {
        errors.push({ line: lineNum, field: 'department', message: `Departement introuvable : ${department}` });
        hasError = true;
      }

      if (!hasError) {
        seenEmails.add(email);
        valid.push({
          email,
          firstName,
          lastName,
          role,
          department: department || undefined,
          jobTitle: jobTitle || undefined,
          phone: phone || undefined,
        });
      }
    }

    return { valid, errors };
  }

  async importUsers(validRows: UserRow[], createdById: string): Promise<CsvImportResult> {
    let created = 0;
    let skipped = 0;
    const importErrors: string[] = [];

    // Preload departments
    const departments = await this.prisma.department.findMany({
      select: { id: true, name: true },
    });
    const deptMap = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));

    for (const row of validRows) {
      try {
        // Double-check email uniqueness
        const existing = await this.prisma.user.findFirst({
          where: { email: row.email },
        });
        if (existing) {
          skipped++;
          continue;
        }

        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);

        const departmentId = row.department
          ? deptMap.get(row.department.toLowerCase()) || null
          : null;

        await this.prisma.user.create({
          data: {
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            role: row.role,
            passwordHash,
            // Initialise le suivi de rotation MDP des l'import
            // (ISO 27001 A.5.17 — campagnes AccessReview PASSWORDS).
            passwordChangedAt: new Date(),
            isActive: true,
            gdprConsentAt: new Date(),
            departmentId,
            jobTitle: row.jobTitle || null,
            phone: row.phone || null,
          },
        });

        created++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        importErrors.push(`${row.email}: ${message}`);
        this.logger.error(`Failed to import user ${row.email}: ${message}`);
      }
    }

    await this.audit.log({
      userId: createdById,
      action: 'USERS_CSV_IMPORTED',
      resourceType: 'User',
      metadata: {
        totalRows: validRows.length,
        created,
        skipped,
        errorsCount: importErrors.length,
      },
      severity: 'INFO',
    });

    this.logger.log(`CSV import completed: ${created} created, ${skipped} skipped, ${importErrors.length} errors`);

    return { created, skipped, errors: importErrors };
  }
}
