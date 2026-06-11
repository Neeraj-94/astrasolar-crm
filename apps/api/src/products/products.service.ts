import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductCategory, ProductStatus } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ProductHistoryService } from '../history/product-history.service';
import type { CreateProductDto, UpdateProductDto } from './dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: ProductHistoryService,
  ) {}

  /** Active catalogue for new-sale pickers (excludes discontinued/archived). */
  listActive(category?: ProductCategory) {
    return this.prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE, category },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
      ],
    });
  }

  /** Full catalogue incl. discontinued/archived (admin view). */
  listAll(category?: ProductCategory) {
    return this.prisma.product.findMany({
      where: { category },
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { status: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  /** Persist a drag-and-drop row order (admin catalogue). */
  async reorder(ids: string[]) {
    const existing = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const known = new Set(existing.map((p) => p.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => known.has(id))
        .map((id, index) =>
          this.prisma.product.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
    );
    return { ok: true };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { log: { orderBy: { changedAt: 'desc' }, take: 50 } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto });
  }

  async update(id: string, dto: UpdateProductDto, changedBy: string) {
    const existing = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: dto });
      const changes = this.diff(existing, updated);
      await this.history.recordChanges(tx, id, changes, changedBy);
      return updated;
    });
  }

  /** Hide from new-sale pickers but keep the row for historical sales. */
  discontinue(id: string, changedBy: string) {
    return this.setStatus(id, ProductStatus.DISCONTINUED, changedBy);
  }

  /** Soft-delete. Blocked if any sale references the product. */
  async archive(id: string, changedBy: string) {
    if (await this.isReferenced(id)) {
      throw new BadRequestException(
        'Product is referenced by one or more sales and cannot be archived',
      );
    }
    return this.setStatus(id, ProductStatus.ARCHIVED, changedBy);
  }

  reactivate(id: string, changedBy: string) {
    return this.setStatus(id, ProductStatus.ACTIVE, changedBy);
  }

  // ---- helpers ----

  private async setStatus(
    id: string,
    status: ProductStatus,
    changedBy: string,
  ) {
    const existing = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { status },
      });
      await this.history.recordChanges(
        tx,
        id,
        [{ field: 'status', oldValue: existing.status, newValue: status }],
        changedBy,
      );
      return updated;
    });
  }

  private async isReferenced(productId: string): Promise<boolean> {
    const [sysRef, extraRef] = await Promise.all([
      this.prisma.systemDetails.count({
        where: {
          OR: [
            { batteryProductId: productId },
            { panelProductId: productId },
            { inverterProductId: productId },
          ],
        },
      }),
      this.prisma.saleExtra.count({ where: { productId } }),
    ]);
    return sysRef + extraRef > 0;
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
    const fields = [
      'name',
      'model',
      'category',
      'stc',
      'commission',
      'rrp',
      'grossPrice',
      'panelWatt',
      'batterySize',
      'batteryModules',
      'inverterType',
      'optimisers',
    ];
    const out: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
    for (const f of fields) {
      const o = before[f];
      const n = after[f];
      if (String(o ?? '') !== String(n ?? '')) {
        out.push({
          field: f,
          oldValue: o == null ? null : String(o),
          newValue: n == null ? null : String(n),
        });
      }
    }
    return out;
  }
}
