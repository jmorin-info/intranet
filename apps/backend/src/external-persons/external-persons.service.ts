import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExternalPersonDto } from './dto/create-external-person.dto';
import { UpdateExternalPersonDto } from './dto/update-external-person.dto';

@Injectable()
export class ExternalPersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string) {
    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.externalPerson.findMany({
      where,
      include: { certificates: { select: { id: true, name: true, certType: true } } },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    const person = await this.prisma.externalPerson.findUnique({
      where: { id },
      include: { certificates: true },
    });
    if (!person) throw new NotFoundException('External person not found');
    return person;
  }

  async create(dto: CreateExternalPersonDto) {
    return this.prisma.externalPerson.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email ?? null,
        company: dto.company ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateExternalPersonDto) {
    await this.findOne(id);

    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.company !== undefined) data.company = dto.company;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.externalPerson.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const person = await this.findOne(id);

    if (person.certificates.length > 0) {
      throw new BadRequestException(
        'Cannot delete an external person with linked certificates. Remove their certificates first.',
      );
    }

    await this.prisma.externalPerson.delete({ where: { id } });
    return { deleted: true };
  }
}
