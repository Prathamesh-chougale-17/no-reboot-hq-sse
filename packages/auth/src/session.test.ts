import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseUser = {
  id: '4d94bf8f-b3d9-49d2-a737-932b40db673a',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
};

const orgAlpha = {
  id: '0faef1a3-1a0f-4cf6-96a0-a9382c006f17',
  name: 'Acme Platform',
  slug: 'acme-platform',
  logo: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  metadata: {},
};

const orgBeta = {
  id: '58e7783f-8921-4dd3-81ed-cb82f37c1cd2',
  name: 'Orbital Labs',
  slug: 'orbital-labs',
  logo: null,
  createdAt: '2026-02-01T10:00:00.000Z',
  metadata: {},
};

let currentSession: {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    token: string;
    activeOrganizationId: string | null;
  };
  user: typeof baseUser;
} | null;

let listedOrganizations: Array<typeof orgAlpha | typeof orgBeta>;
let activeMemberRole: { role: string } | null;
let fullOrganization: typeof orgAlpha | typeof orgBeta | null;

const {
  getSessionMock,
  listOrganizationsMock,
  getActiveMemberRoleMock,
  getFullOrganizationMock,
  setActiveOrganizationMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => currentSession),
  listOrganizationsMock: vi.fn(async () => listedOrganizations),
  getActiveMemberRoleMock: vi.fn(async () => activeMemberRole),
  getFullOrganizationMock: vi.fn(async () => fullOrganization),
  setActiveOrganizationMock: vi.fn(async () => undefined),
}));

vi.mock('./server', () => ({
  auth: {
    api: {
      getSession: getSessionMock,
      listOrganizations: listOrganizationsMock,
      getActiveMemberRole: getActiveMemberRoleMock,
      getFullOrganization: getFullOrganizationMock,
      setActiveOrganization: setActiveOrganizationMock,
    },
  },
}));

import { resolveAuthContext } from './session';

describe('resolveAuthContext', () => {
  beforeEach(() => {
    currentSession = {
      session: {
        id: 'session-1',
        userId: baseUser.id,
        expiresAt: new Date('2026-01-10T10:00:00.000Z'),
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        updatedAt: new Date('2026-01-01T10:00:00.000Z'),
        token: 'session-token',
        activeOrganizationId: null,
      },
      user: baseUser,
    };
    listedOrganizations = [];
    activeMemberRole = { role: 'owner' };
    fullOrganization = orgAlpha;

    getSessionMock.mockClear();
    listOrganizationsMock.mockClear();
    getActiveMemberRoleMock.mockClear();
    getFullOrganizationMock.mockClear();
    setActiveOrganizationMock.mockClear();
  });

  it('auto-selects the only organization when the session has no active workspace', async () => {
    listedOrganizations = [orgAlpha];

    const context = await resolveAuthContext(new Headers({ cookie: 'session=valid' }));

    expect(setActiveOrganizationMock).toHaveBeenCalledWith({
      body: {
        organizationId: orgAlpha.id,
      },
      headers: expect.any(Headers),
    });
    expect(getActiveMemberRoleMock).toHaveBeenCalledTimes(1);
    expect(getFullOrganizationMock).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: {
        organizationId: orgAlpha.id,
        membersLimit: 100,
      },
    });
    expect(context).toMatchObject({
      organizationId: orgAlpha.id,
      organization: {
        id: orgAlpha.id,
        name: orgAlpha.name,
      },
      organizations: [orgAlpha],
      role: 'owner',
    });
  });

  it('keeps memberships but leaves the active workspace unset when multiple orgs exist', async () => {
    listedOrganizations = [orgAlpha, orgBeta];

    const context = await resolveAuthContext(new Headers({ cookie: 'session=valid' }));

    expect(setActiveOrganizationMock).not.toHaveBeenCalled();
    expect(getActiveMemberRoleMock).not.toHaveBeenCalled();
    expect(getFullOrganizationMock).not.toHaveBeenCalled();
    expect(context).toMatchObject({
      organizationId: null,
      organization: null,
      organizations: [orgAlpha, orgBeta],
      role: null,
    });
  });

  it('clears a stale active workspace and recovers to the sole remaining membership', async () => {
    currentSession = {
      session: {
        id: 'session-1',
        userId: baseUser.id,
        expiresAt: new Date('2026-01-10T10:00:00.000Z'),
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        updatedAt: new Date('2026-01-01T10:00:00.000Z'),
        token: 'session-token',
        activeOrganizationId: '2f6cbdbc-ecab-4bb7-88cc-18fb4d40213b',
      },
      user: baseUser,
    };
    listedOrganizations = [orgBeta];
    activeMemberRole = { role: 'admin' };
    fullOrganization = orgBeta;

    const context = await resolveAuthContext(new Headers({ cookie: 'session=valid' }));

    expect(setActiveOrganizationMock).toHaveBeenNthCalledWith(1, {
      body: {
        organizationId: null,
      },
      headers: expect.any(Headers),
    });
    expect(setActiveOrganizationMock).toHaveBeenNthCalledWith(2, {
      body: {
        organizationId: orgBeta.id,
      },
      headers: expect.any(Headers),
    });
    expect(context).toMatchObject({
      organizationId: orgBeta.id,
      organization: {
        id: orgBeta.id,
        name: orgBeta.name,
      },
      organizations: [orgBeta],
      role: 'admin',
    });
  });
});
