import { aliasedTable, and, desc, eq, sql } from 'drizzle-orm';

import type {
  AuthRole,
  InvitationPreviewDto,
  OrganizationMemberDto,
  PendingInvitationDto,
  UserDto,
} from '@acme/shared';

import { getDb } from '../client';
import { invitations, members, organizations, users } from '../schema';

export interface UsersRepository {
  hasAnyMembership(userId: string): Promise<boolean>;
  listOrganizationMembers(organizationId: string): Promise<OrganizationMemberDto[]>;
  listPendingInvitations(organizationId: string): Promise<PendingInvitationDto[]>;
  listPendingInvitationsByEmail(email: string): Promise<InvitationPreviewDto[]>;
  findInvitationById(invitationId: string): Promise<InvitationAuditTarget | null>;
  ping(): Promise<boolean>;
}

export type InvitationAuditTarget = {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: AuthRole;
  status: string;
  inviterId: string | null;
  inviterName: string | null;
  expiresAt: string;
};

const toUserDto = (record: typeof users.$inferSelect): UserDto => ({
  id: record.id,
  name: record.name,
  email: record.email,
  emailVerified: record.emailVerified,
  image: record.image ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const parseInvitationRole = (role: string | null): PendingInvitationDto['role'] =>
  role === 'owner' || role === 'admin' ? role : 'member';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const toInvitationPreviewDto = (row: {
  invitation: typeof invitations.$inferSelect;
  organization: Pick<typeof organizations.$inferSelect, 'name'>;
}): InvitationPreviewDto => ({
  id: row.invitation.id,
  email: row.invitation.email,
  role: parseInvitationRole(row.invitation.role ?? null),
  status: row.invitation.status,
  expiresAt: row.invitation.expiresAt.toISOString(),
  organizationName: row.organization.name,
});

export const createUsersRepository = (): UsersRepository => ({
  async hasAnyMembership(userId) {
    const database = getDb();
    const rows = await database
      .select({
        id: members.id,
      })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);

    return rows.length > 0;
  },

  async listOrganizationMembers(organizationId) {
    const database = getDb();
    const rows = await database
      .select({
        member: members,
        user: users,
      })
      .from(members)
      .innerJoin(users, eq(members.userId, users.id))
      .where(eq(members.organizationId, organizationId))
      .orderBy(desc(members.createdAt));

    return rows.map(({ member, user }) => ({
      id: member.id,
      organizationId: member.organizationId,
      role: member.role === 'owner' || member.role === 'admin' ? member.role : 'member',
      createdAt: member.createdAt.toISOString(),
      user: toUserDto(user),
    }));
  },

  async listPendingInvitations(organizationId) {
    const database = getDb();
    const rows = await database
      .select()
      .from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, 'pending')))
      .orderBy(desc(invitations.createdAt));

    return rows.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: parseInvitationRole(invitation.role ?? null),
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      organizationId: invitation.organizationId,
      inviterId: invitation.inviterId,
      createdAt: invitation.createdAt.toISOString(),
    }));
  },

  async listPendingInvitationsByEmail(email) {
    const database = getDb();
    const rows = await database
      .select({
        invitation: invitations,
        organization: {
          name: organizations.name,
        },
      })
      .from(invitations)
      .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
      .where(and(eq(invitations.email, normalizeEmail(email)), eq(invitations.status, 'pending')))
      .orderBy(desc(invitations.createdAt));

    return rows.map(toInvitationPreviewDto);
  },

  async findInvitationById(invitationId) {
    const database = getDb();
    const inviterUsers = aliasedTable(users, 'inviter_users');
    const [invitation] = await database
      .select({
        invitation: invitations,
        organization: {
          name: organizations.name,
        },
        inviter: {
          name: inviterUsers.name,
        },
      })
      .from(invitations)
      .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
      .leftJoin(inviterUsers, eq(invitations.inviterId, inviterUsers.id))
      .where(eq(invitations.id, invitationId))
      .limit(1);

    if (!invitation) {
      return null;
    }

    return {
      id: invitation.invitation.id,
      organizationId: invitation.invitation.organizationId,
      organizationName: invitation.organization.name,
      email: invitation.invitation.email,
      role: parseInvitationRole(invitation.invitation.role ?? null),
      status: invitation.invitation.status,
      inviterId: invitation.invitation.inviterId,
      inviterName: invitation.inviter?.name ?? null,
      expiresAt: invitation.invitation.expiresAt.toISOString(),
    };
  },

  async ping() {
    const database = getDb();
    await database.execute(sql`select 1`);
    return true;
  },
});
