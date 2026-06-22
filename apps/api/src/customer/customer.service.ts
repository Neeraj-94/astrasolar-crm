import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';

/**
 * Customer self-service. Every method is strictly scoped to the logged-in
 * customer's own record — resolved User -> Customer -> Sale (identity/contact
 * details read off the sale's lead). There is no scope-selector here: a customer
 * can only ever see their own data (gated by customer:read:self on the controller).
 */
@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve the customer's linked sale (with identity on the sale's lead). */
  private async resolve(user: AuthUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: user.id },
      include: {
        sale: {
          include: {
            lead: true,
            owner: { select: { name: true } },
            systemDetails: true,
            statusDetails: true,
            paymentDetails: true,
            installation: {
              include: { installer: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException(
        'No customer profile is linked to this account',
      );
    }
    return { customer, sale: customer.sale };
  }

  async overview(user: AuthUser) {
    const { sale } = await this.resolve(user);
    const c = sale.lead;

    const stageOf = (s?: string | null) => s ?? 'PENDING';
    const sd = sale?.statusDetails;
    const timeline = sd
      ? [
          { key: 'finance', label: 'Finance Approval', status: stageOf(sd.financeStatus) },
          { key: 'preapproval', label: 'Pre-approval', status: stageOf(sd.preapprovalStatus) },
          { key: 'meterChange', label: 'Meter Change', status: stageOf(sd.meterChangeStatus) },
          { key: 'install', label: 'Installation', status: stageOf(sd.installStatus) },
          { key: 'payment', label: 'Payment', status: stageOf(sd.paymentStatus) },
          { key: 'commissioning', label: 'Commissioning', status: stageOf(sd.commissioningStatus) },
          { key: 'ces', label: 'CES / Council', status: stageOf(sd.cesStatus) },
        ]
      : [];

    const done = timeline.filter((t) => t.status === 'COMPLETED').length;
    const relevant = timeline.filter((t) => t.status !== 'NOT_REQUIRED').length;

    return {
      customerName: `${c.firstName} ${c.surName}`.trim(),
      email: c.email,
      phone: c.phone,
      address: [c.address, c.state, c.postCode].filter(Boolean).join(', '),
      hasSale: !!sale,
      sale: sale
        ? {
            saleRef: sale.saleRef,
            status: sale.status,
            saleType: sale.saleType,
            systemType: sale.systemType,
            soldPrice: Number(sale.soldPrice ?? 0),
            saleDate: sale.saleDate
              ? sale.saleDate.toISOString().slice(0, 10)
              : null,
            consultantName: sale.owner?.name ?? null,
          }
        : null,
      install: sale?.installation
        ? {
            status: sale.installation.status,
            installDate: sale.installation.installDate
              ? sale.installation.installDate.toISOString().slice(0, 10)
              : null,
            installerName: sale.installation.installer?.name ?? null,
          }
        : null,
      progress: { completed: done, total: relevant },
      timeline,
    };
  }

  async system(user: AuthUser) {
    const { sale } = await this.resolve(user);
    const sd = sale?.systemDetails;
    if (!sale || !sd) {
      return { hasSystem: false, system: null };
    }
    const num = (v: any) => (v == null ? null : Number(v));
    return {
      hasSystem: true,
      system: {
        // Solar
        panelModel: sd.panelModel,
        panelWatt: sd.panelWatt,
        numPanels: sd.numPanels,
        systemSize: num(sd.systemSize),
        // Battery
        batteryBrand: sd.batteryBrand,
        batteryModel: sd.batteryModel,
        batterySize: num(sd.batterySize),
        batteryModules: sd.batteryModules,
        // Inverter / install
        inverterModel: sd.inverterModel,
        inverterType: sd.inverterType,
        phase: sd.phase,
        roofType: sd.roofType,
        storeys: sd.storeys,
        nmi: sd.nmi,
      },
    };
  }

  async invoices(user: AuthUser) {
    const { sale } = await this.resolve(user);
    if (!sale) return { hasSale: false, invoice: null };

    const stage = sale.statusDetails?.paymentStatus ?? 'PENDING';
    const state =
      stage === 'COMPLETED'
        ? 'PAID'
        : stage === 'IN_PROGRESS'
          ? 'PART-PAID'
          : 'DUE';
    return {
      hasSale: true,
      invoice: {
        saleRef: sale.saleRef,
        amount: Number(sale.soldPrice ?? 0),
        saleDate: sale.saleDate
          ? sale.saleDate.toISOString().slice(0, 10)
          : null,
        paymentStatus: stage,
        invoiceState: state,
        paymentDate: sale.paymentDetails?.paymentDate
          ? sale.paymentDetails.paymentDate.toISOString().slice(0, 10)
          : null,
        paymentNotes: sale.paymentDetails?.paymentNotes ?? null,
      },
    };
  }

  async support(user: AuthUser) {
    const { sale } = await this.resolve(user);
    if (!sale) return { issues: [] };

    const issues = await this.prisma.postInstallIssue.findMany({
      where: { saleId: sale.id },
      orderBy: { createdAt: 'desc' },
      include: { handledBy: { select: { name: true } } },
    });

    return {
      issues: issues.map((i) => ({
        id: i.id,
        issueNotes: i.issueNotes,
        solution: i.solution,
        handledBy: i.handledBy?.name ?? null,
        resolved: !!i.solution,
        loggedAt: (i.issueLogDate ?? i.createdAt).toISOString().slice(0, 10),
      })),
    };
  }

  /** Customer raises a support request against their sale. */
  async createSupport(user: AuthUser, body: { message?: string }) {
    const { sale } = await this.resolve(user);
    if (!sale) {
      throw new BadRequestException('No sale on file to raise a request against');
    }
    const message = (body.message ?? '').trim();
    if (!message) throw new BadRequestException('A message is required');

    const issue = await this.prisma.postInstallIssue.create({
      data: {
        saleId: sale.id,
        issueLogDate: new Date(),
        issueNotes: message,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'CUSTOMER_SUPPORT_RAISED',
      entity: 'Sale',
      entityId: sale.id,
      metadata: { issueId: issue.id },
    });
    return { ok: true, id: issue.id };
  }
}
