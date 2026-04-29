'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@acme/ui';
import type {
  AuditLogEntryDto,
  AuthRole,
  CreateInvitationInput,
  CurrentUserDto,
} from '@acme/shared';

import { ApiClientError, apiClient } from '@/lib/api-client';
import { useAuditLogsQuery, useUsersWorkspaceQuery } from '@/lib/queries';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to complete the request';

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const getInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const memberRoleVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
};

const canManageMembers = (role: AuthRole | null | undefined) =>
  role === 'owner' || role === 'admin';

const isRequestTimeoutError = (error: unknown) =>
  error instanceof ApiClientError && error.code === 'REQUEST_TIMEOUT';

const getActorLabel = (entry: AuditLogEntryDto) =>
  entry.actor?.name ?? entry.actor?.email ?? entry.targetEmail ?? 'A teammate';

const getAuditSummary = (entry: AuditLogEntryDto) => {
  const invitedRole =
    entry.metadata && typeof entry.metadata.invitedRole === 'string'
      ? entry.metadata.invitedRole
      : 'member';
  const organizationName =
    entry.metadata && typeof entry.metadata.organizationName === 'string'
      ? entry.metadata.organizationName
      : 'this organization';

  switch (entry.eventType) {
    case 'organization.created':
      return `${getActorLabel(entry)} created ${organizationName}.`;
    case 'invitation.created':
      return `${getActorLabel(entry)} invited ${entry.targetEmail ?? 'a teammate'} as ${invitedRole}.`;
    case 'invitation.accepted':
      return `${getActorLabel(entry)} accepted the invitation as ${invitedRole}.`;
    default:
      return `${getActorLabel(entry)} completed an organization change.`;
  }
};

const pageHeaderClassName =
  'flex flex-col gap-4 border-b border-slate-200 pb-5 pt-3 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between';
const eyebrowClassName =
  'text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400';
const pageTitleClassName =
  'mt-1 text-4xl font-semibold leading-none text-slate-950 dark:text-slate-50 md:text-6xl';
const pageSubtitleClassName =
  'mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300';
const metricClassName =
  'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none';
const metricLabelClassName =
  'text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400';
const metricValueClassName =
  'mt-2 text-3xl font-semibold leading-none text-slate-950 dark:text-slate-50';
const panelClassName =
  'rounded-xl border border-slate-200 bg-white/85 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none';
const panelHeaderClassName =
  'flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800';
const panelBodyClassName = 'p-4';
const sectionTitleClassName = 'text-base font-semibold text-slate-950 dark:text-slate-50';
const sectionCopyClassName = 'mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400';
const dataRowClassName =
  'flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800';

export function UsersWorkspace({
  viewer,
  deniedRoute,
}: {
  viewer: CurrentUserDto;
  deniedRoute?: string | undefined;
}) {
  const [inviteForm, setInviteForm] = useState<CreateInvitationInput>({
    email: '',
    role: 'member',
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const workspaceQuery = useUsersWorkspaceQuery(Boolean(viewer.organization?.id));

  const workspace = workspaceQuery.data;
  const effectiveViewer = workspace?.viewer ?? viewer;
  const members = workspace?.members ?? [];
  const invitations = workspace?.invitations ?? [];
  const canInviteMembers = canManageMembers(effectiveViewer.role);
  const auditLogsQuery = useAuditLogsQuery(
    25,
    Boolean(viewer.organization?.id && canInviteMembers),
  );
  const errorMessage = workspaceQuery.isError ? getErrorMessage(workspaceQuery.error) : null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setSetupError(null);
    const submittedInvite = { ...inviteForm };

    try {
      setIsInviting(true);
      await apiClient.createInvitation(submittedInvite);

      setInviteForm({ email: '', role: 'member' });
      setNotice(`Invitation queued for ${submittedInvite.email}`);
      await Promise.all([workspaceQuery.refetch(), auditLogsQuery.refetch()]);
    } catch (error) {
      if (isRequestTimeoutError(error)) {
        const [workspaceResult] = await Promise.all([
          workspaceQuery.refetch(),
          auditLogsQuery.refetch(),
        ]);
        const refreshedInvitations = workspaceResult.data?.invitations ?? [];
        const matchingInvitation = refreshedInvitations.find(
          (invitation) =>
            normalizeEmail(invitation.email) === normalizeEmail(submittedInvite.email) &&
            invitation.role === submittedInvite.role,
        );

        if (matchingInvitation) {
          setInviteForm({ email: '', role: 'member' });
          setNotice(`Invitation queued for ${submittedInvite.email}`);
          setSetupError(null);
          return;
        }
      }

      setSetupError(getErrorMessage(error));
    } finally {
      setIsInviting(false);
    }
  };

  const activeOrganization = effectiveViewer.organization;

  if (!activeOrganization) {
    return (
      <div className="flex flex-col gap-6">
        <section className={pageHeaderClassName}>
          <div>
            <p className={eyebrowClassName}>Workspace Required</p>
            <h1 className={pageTitleClassName}>Finish onboarding</h1>
            <p className={pageSubtitleClassName}>
              Choose an invited workspace or create your first workspace before managing teammates.
            </p>
          </div>
        </section>

        <Alert>
          <AlertTitle>No active workspace selected</AlertTitle>
          <AlertDescription>
            <Link className="font-semibold text-teal-700 dark:text-teal-300" href="/onboarding">
              Continue onboarding
            </Link>{' '}
            to activate the right workspace for this session.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={pageHeaderClassName}>
        <div>
          <p className={eyebrowClassName}>Organization Members</p>
          <h1 className={pageTitleClassName}>
            {canInviteMembers ? 'Team access' : 'Workspace directory'}
          </h1>
          <p className={pageSubtitleClassName}>
            {activeOrganization.name} is the active organization for this session.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={memberRoleVariant[effectiveViewer.role ?? 'member'] ?? 'outline'}>
            {effectiveViewer.role ?? 'member'}
          </Badge>
          <Button
            variant="secondary"
            onClick={() =>
              void Promise.all([
                workspaceQuery.refetch(),
                canInviteMembers ? auditLogsQuery.refetch() : Promise.resolve(),
              ])
            }
          >
            {workspaceQuery.isFetching && !workspaceQuery.isPending ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </section>

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Members</p>
          <p className={metricValueClassName}>{members.length}</p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Pending invites</p>
          <p className={metricValueClassName}>{invitations.length}</p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Access mode</p>
          <p className={metricValueClassName}>{canInviteMembers ? 'Manage' : 'Read'}</p>
        </div>
      </section>

      {deniedRoute ? (
        <Alert variant="destructive">
          <AlertTitle>Access denied for {deniedRoute}</AlertTitle>
          <AlertDescription>
            Your role is <strong>{effectiveViewer.role ?? 'member'}</strong> in{' '}
            <strong>{activeOrganization.name}</strong>. Switch workspace if you need owner or admin
            access.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(20rem,0.75fr)_minmax(0,1.25fr)]">
        <div className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>
                {canInviteMembers ? 'Invite Teammate' : 'Current Access'}
              </h2>
              <p className={sectionCopyClassName}>
                {canInviteMembers
                  ? 'Owners and admins can add members to the active organization.'
                  : 'Member management is limited to owners and admins.'}
              </p>
            </div>
          </div>
          <div className={panelBodyClassName}>
            {canInviteMembers ? (
              <div className="space-y-4">
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-slate-700 dark:text-slate-300"
                      htmlFor="invite-email"
                    >
                      Email
                    </label>
                    <Input
                      id="invite-email"
                      placeholder="jane@example.com"
                      type="email"
                      value={inviteForm.email}
                      onChange={(event) =>
                        setInviteForm((current) => ({ ...current, email: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium text-slate-700 dark:text-slate-300"
                      htmlFor="invite-role"
                    >
                      Role
                    </label>
                    <Select
                      value={inviteForm.role}
                      onValueChange={(value: string | null) => {
                        if (!value) return;

                        setInviteForm((current) => ({
                          ...current,
                          role: value as CreateInvitationInput['role'],
                        }));
                      }}
                    >
                      <SelectTrigger id="invite-role" className="w-full">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={isInviting}>
                    {isInviting ? 'Sending invitation' : 'Send invitation'}
                  </Button>
                </form>
                {notice ? (
                  <Alert>
                    <AlertTitle>Invitation queued</AlertTitle>
                    <AlertDescription>{notice}</AlertDescription>
                  </Alert>
                ) : null}
                {(setupError ?? errorMessage) ? (
                  <Alert variant="destructive">
                    <AlertTitle>Unable to send invitation</AlertTitle>
                    <AlertDescription>{setupError ?? errorMessage}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : (
              <Alert>
                <AlertTitle>Member access is active</AlertTitle>
                <AlertDescription>
                  You can view teammates in this organization. Invitation management is restricted.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className={`${panelClassName} overflow-hidden`}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Members</h2>
              <p className={sectionCopyClassName}>Loaded from the protected Hono service layer.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            {workspaceQuery.isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : workspaceQuery.isError ? (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertTitle>Unable to load members</AlertTitle>
                  <AlertDescription>{getErrorMessage(workspaceQuery.error)}</AlertDescription>
                </Alert>
              </div>
            ) : members.length === 0 ? (
              <div className="p-4">
                <Alert>
                  <AlertTitle>No members yet</AlertTitle>
                  <AlertDescription>
                    Invite the first teammate to start building inside this organization.
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {members.map((member) => (
                    <tr key={member.id} className="bg-white dark:bg-slate-950/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar size="lg">
                            <AvatarFallback>
                              {getInitials(member.user.name ?? member.user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-950 dark:text-slate-50">
                            {member.user.name ?? member.user.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {member.user.email}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={memberRoleVariant[member.role] ?? 'outline'}>
                          {member.role}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section className={panelClassName}>
        <div className={panelHeaderClassName}>
          <div>
            <h2 className={sectionTitleClassName}>Pending Invitations</h2>
            <p className={sectionCopyClassName}>
              Open invitations that have not been accepted yet.
            </p>
          </div>
        </div>
        {canInviteMembers ? (
          invitations.length === 0 ? (
            <div className={panelBodyClassName}>
              <Alert>
                <AlertTitle>No pending invitations</AlertTitle>
                <AlertDescription>
                  New invites will appear here until they are accepted.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div>
              {invitations.map((invitation) => (
                <div key={invitation.id} className={dataRowClassName}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950 dark:text-slate-50">
                      {invitation.email}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Expires {new Date(invitation.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={invitation.role === 'admin' ? 'secondary' : 'outline'}>
                    {invitation.role}
                  </Badge>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className={panelBodyClassName}>
            <Alert>
              <AlertTitle>Invitation visibility is restricted</AlertTitle>
              <AlertDescription>
                Owners and admins can review pending invitations for this organization.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </section>

      {canInviteMembers ? (
        <section className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Audit Activity</h2>
              <p className={sectionCopyClassName}>Recent organization access changes.</p>
            </div>
          </div>
          <div>
            {auditLogsQuery.isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            ) : auditLogsQuery.isError ? (
              <div className={panelBodyClassName}>
                <Alert variant="destructive">
                  <AlertTitle>Unable to load audit activity</AlertTitle>
                  <AlertDescription>{getErrorMessage(auditLogsQuery.error)}</AlertDescription>
                </Alert>
              </div>
            ) : auditLogsQuery.data?.items.length ? (
              auditLogsQuery.data.items.map((entry) => (
                <div key={entry.id} className={dataRowClassName}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-950 dark:text-slate-50">
                      {getAuditSummary(entry)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline">{entry.eventType}</Badge>
                </div>
              ))
            ) : (
              <div className={panelBodyClassName}>
                <Alert>
                  <AlertTitle>No audit activity yet</AlertTitle>
                  <AlertDescription>
                    Organization creation and invitation activity will appear here.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
