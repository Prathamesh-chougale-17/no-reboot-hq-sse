import { desc, eq } from 'drizzle-orm';

import type { AuditEventType, AuditLogEntryDto, AuditLogListDto, AuthRole } from '@acme/shared';

import { getDb } from '../client';
import { auditLogs, users } from '../schema';

export type AppendAuditLogInput = {
  organizationId: string;
  eventType: AuditEventType;
  actorUserId?: string | null;
  actorRole?: AuthRole | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  targetInvitationId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

export interface AuditRepository {
  appendAuditLog(input: AppendAuditLogInput): Promise<void>;
  listOrganizationAuditLogs(organizationId: string, limit: number): Promise<AuditLogListDto>;
}

const parseAuditRole = (role: string | null): AuthRole | null => {
  if (role === 'owner' || role === 'admin' || role === 'member') {
    return role;
  }

  return null;
};

const toAuditLogEntry = (row: {
  auditLog: typeof auditLogs.$inferSelect;
  actor: Pick<typeof users.$inferSelect, 'id' | 'name' | 'email'> | null;
}): AuditLogEntryDto => ({
  id: row.auditLog.id,
  organizationId: row.auditLog.organizationId,
  eventType: row.auditLog.eventType as AuditEventType,
  actor: row.actor
    ? {
        userId: row.actor.id,
        name: row.actor.name,
        email: row.actor.email,
        role: parseAuditRole(row.auditLog.actorRole ?? null),
      }
    : null,
  targetUserId: row.auditLog.targetUserId ?? null,
  targetEmail: row.auditLog.targetEmail ?? null,
  targetInvitationId: row.auditLog.targetInvitationId ?? null,
  requestId: row.auditLog.requestId ?? null,
  ipAddress: row.auditLog.ipAddress ?? null,
  userAgent: row.auditLog.userAgent ?? null,
  metadata:
    row.auditLog.metadata && typeof row.auditLog.metadata === 'object' ? row.auditLog.metadata : {},
  createdAt: row.auditLog.createdAt.toISOString(),
});

export const createAuditRepository = (): AuditRepository => ({
  async appendAuditLog(input) {
    const database = getDb();

    await database.insert(auditLogs).values({
      organizationId: input.organizationId,
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      targetUserId: input.targetUserId ?? null,
      targetEmail: input.targetEmail ?? null,
      targetInvitationId: input.targetInvitationId ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    });
  },

  async listOrganizationAuditLogs(organizationId, limit) {
    const database = getDb();
    const rows = await database
      .select({
        auditLog: auditLogs,
        actor: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(eq(auditLogs.organizationId, organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return {
      items: rows.map(toAuditLogEntry),
    };
  },
});
