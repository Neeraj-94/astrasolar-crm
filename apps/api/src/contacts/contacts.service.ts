import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAccountDto, CreateContactDto, UpdateContactDto } from './dto';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string) {
    return this.prisma.contact.findMany({
      where: search
        ? {
            OR: [
              { surname: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { surname: 'asc' },
      take: 100,
      include: { account: true },
    });
  }

  async get(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { account: true, leads: true, sales: true },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  create(dto: CreateContactDto) {
    return this.prisma.contact.create({ data: dto });
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.get(id);
    return this.prisma.contact.update({ where: { id }, data: dto });
  }

  // Accounts
  listAccounts() {
    return this.prisma.account.findMany({ orderBy: { name: 'asc' } });
  }

  createAccount(dto: CreateAccountDto) {
    return this.prisma.account.create({ data: dto });
  }
}
