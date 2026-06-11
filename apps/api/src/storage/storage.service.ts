import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';

/**
 * Phase 3 — Cloudflare R2 (S3-compatible). Uploads go client -> R2 directly via
 * a presigned PUT; only the metadata row lives in Postgres. Downloads use a
 * presigned GET. No egress fees, no blobs through the API.
 */
@Injectable()
export class StorageService {
  private client: S3Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private s3(): S3Client {
    if (this.client) return this.client;
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId || !process.env.R2_ACCESS_KEY_ID) {
      throw new InternalServerErrorException('R2 storage is not configured');
    }
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    return this.client;
  }

  private get bucket() {
    return process.env.R2_BUCKET || 'astra-crm';
  }

  /** Issue a presigned PUT and reserve the metadata row. */
  async createUploadUrl(input: {
    entity: string;
    entityId: string;
    fileName: string;
    contentType?: string;
    userId: string;
  }) {
    const key = `${input.entity.toLowerCase()}/${input.entityId}/${randomUUID()}-${input.fileName}`;
    const url = await getSignedUrl(
      this.s3(),
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: input.contentType,
      }),
      { expiresIn: 900 },
    );

    const doc = await this.prisma.document.create({
      data: {
        entity: input.entity,
        entityId: input.entityId,
        key,
        fileName: input.fileName,
        contentType: input.contentType,
        uploadedById: input.userId,
      },
    });
    await this.audit.record({
      userId: input.userId,
      action: 'DOCUMENT_UPLOAD_URL',
      entity: 'Document',
      entityId: doc.id,
    });
    return { uploadUrl: url, document: doc };
  }

  async listFor(entity: string, entityId: string) {
    return this.prisma.document.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async downloadUrl(documentId: string) {
    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
    });
    const url = await getSignedUrl(
      this.s3(),
      new GetObjectCommand({ Bucket: this.bucket, Key: doc.key }),
      { expiresIn: 900 },
    );
    return { downloadUrl: url, document: doc };
  }
}
