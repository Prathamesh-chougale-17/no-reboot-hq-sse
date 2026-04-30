"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Alert,
  AlertDescription,
  AlertTitle,
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
} from "@acme/ui";
import type {
  ConfigEntryDto,
  ConfigEventDto,
  ConfigValueType,
  CurrentUserDto,
} from "@acme/shared";

import { ApiClientError, apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  useConfigAppsQuery,
  useConfigEntriesQuery,
  useConfigEntryVersionsQuery,
  useConfigEnvironmentsQuery,
  useConfigServiceTokensQuery,
} from "@/lib/queries";

const valueTypes: ConfigValueType[] = [
  "string",
  "number",
  "boolean",
  "json",
  "secret",
];

const panelClassName =
  "rounded-lg border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-none";
const panelHeaderClassName =
  "flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800";
const panelBodyClassName = "p-4";
const sectionTitleClassName =
  "text-base font-semibold text-slate-950 dark:text-slate-50";
const sectionCopyClassName =
  "mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400";
const metricClassName =
  "rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 dark:shadow-none";
const metricLabelClassName =
  "text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400";
const metricValueClassName =
  "mt-2 text-3xl font-semibold leading-none text-slate-950 dark:text-slate-50";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete the request";

const stringifyValue = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2);

const getEntryEventTypes: ConfigEventDto["eventType"][] = [
  "config.entry.created",
  "config.entry.updated",
  "config.entry.rollback",
  "config.environment.created",
  "config.token.created",
  "config.token.revoked",
];

const canManageConfig = (role: CurrentUserDto["role"]) =>
  role === "owner" || role === "admin";

export function ConfigWorkspace({ viewer }: { viewer: CurrentUserDto }) {
  const queryClient = useQueryClient();
  const appsQuery = useConfigAppsQuery();
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const environmentsQuery = useConfigEnvironmentsQuery(selectedAppId);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<
    string | null
  >(null);
  const entriesQuery = useConfigEntriesQuery(selectedEnvironmentId);
  const tokensQuery = useConfigServiceTokensQuery(selectedEnvironmentId);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const versionsQuery = useConfigEntryVersionsQuery(selectedEntryId);
  const [appForm, setAppForm] = useState({ name: "", slug: "" });
  const [environmentForm, setEnvironmentForm] = useState({
    name: "Production",
    slug: "production",
  });
  const [entryForm, setEntryForm] = useState<{
    key: string;
    valueType: ConfigValueType;
    value: string;
    description: string;
    changeReason: string;
  }>({
    key: "FEATURE_CHECKOUT_ENABLED",
    valueType: "boolean",
    value: "true",
    description: "",
    changeReason: "",
  });
  const [tokenName, setTokenName] = useState("local simulator");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveState, setLiveState] = useState<"connecting" | "live" | "offline">(
    "offline",
  );
  const [lastEvent, setLastEvent] = useState<ConfigEventDto | null>(null);

  const apps = useMemo(
    () => appsQuery.data?.items ?? [],
    [appsQuery.data?.items],
  );
  const selectedApp = apps.find((app) => app.id === selectedAppId) ?? null;
  const environments = useMemo(
    () => environmentsQuery.data?.items ?? [],
    [environmentsQuery.data?.items],
  );
  const selectedEnvironment =
    environments.find(
      (environment) => environment.id === selectedEnvironmentId,
    ) ?? null;
  const entries = useMemo(
    () => entriesQuery.data?.items ?? [],
    [entriesQuery.data?.items],
  );
  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const tokens = tokensQuery.data?.items ?? [];
  const canManage = canManageConfig(viewer.role);

  const currentEntryForKey = useMemo(
    () => entries.find((entry) => entry.key === entryForm.key.trim()),
    [entries, entryForm.key],
  );

  useEffect(() => {
    if (!selectedAppId && apps[0]) {
      setSelectedAppId(apps[0].id);
    }
  }, [apps, selectedAppId]);

  useEffect(() => {
    if (!selectedEnvironmentId && environments[0]) {
      setSelectedEnvironmentId(environments[0].id);
    }
  }, [environments, selectedEnvironmentId]);

  useEffect(() => {
    if (!selectedEntryId && entries[0]) {
      setSelectedEntryId(entries[0].id);
    }
  }, [entries, selectedEntryId]);

  useEffect(() => {
    if (!selectedEnvironmentId) {
      setLiveState("offline");
      return;
    }

    setLiveState("connecting");
    const eventSource = new EventSource(
      `/api/v1/config/environments/${encodeURIComponent(selectedEnvironmentId)}/events`,
    );

    eventSource.addEventListener("connected", () => {
      setLiveState("live");
    });
    eventSource.addEventListener("unavailable", () => {
      setLiveState("offline");
    });
    eventSource.onerror = () => {
      setLiveState("offline");
    };

    for (const eventType of getEntryEventTypes) {
      eventSource.addEventListener(eventType, (message) => {
        const parsed = JSON.parse(
          (message as MessageEvent<string>).data,
        ) as ConfigEventDto;
        setLastEvent(parsed);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.config.entries(selectedEnvironmentId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.config.tokens(selectedEnvironmentId),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.config.environments(selectedAppId),
        });
      });
    }

    return () => {
      eventSource.close();
    };
  }, [queryClient, selectedAppId, selectedEnvironmentId]);

  const refreshSelectedEnvironment = async () => {
    if (!selectedEnvironmentId) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.config.entries(selectedEnvironmentId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.config.tokens(selectedEnvironmentId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.config.versions(selectedEntryId),
      }),
    ]);
  };

  const runMutation = async (operation: () => Promise<void>) => {
    setNotice(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await operation();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const createApp = () =>
    runMutation(async () => {
      const result = await apiClient.createConfigApp({
        name: appForm.name,
        ...(appForm.slug.trim() ? { slug: appForm.slug.trim() } : {}),
      });
      setSelectedAppId(result.app.id);
      setAppForm({ name: "", slug: "" });
      setNotice(`Created app ${result.app.name}`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.config.apps });
    });

  const createEnvironment = () =>
    runMutation(async () => {
      if (!selectedAppId) {
        throw new ApiClientError(
          "Create an app before adding environments",
          400,
        );
      }

      const result = await apiClient.createConfigEnvironment(selectedAppId, {
        name: environmentForm.name,
        ...(environmentForm.slug.trim()
          ? { slug: environmentForm.slug.trim() }
          : {}),
      });
      setSelectedEnvironmentId(result.environment.id);
      setNotice(`Created environment ${result.environment.name}`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.config.environments(selectedAppId),
      });
    });

  const saveEntry = () =>
    runMutation(async () => {
      if (!selectedEnvironmentId) {
        throw new ApiClientError(
          "Create an environment before writing config",
          400,
        );
      }

      const result = await apiClient.upsertConfigEntry(selectedEnvironmentId, {
        key: entryForm.key,
        valueType: entryForm.valueType,
        value: entryForm.value,
        expectedVersion: currentEntryForKey?.currentVersion ?? 0,
        ...(entryForm.description.trim()
          ? { description: entryForm.description.trim() }
          : {}),
        ...(entryForm.changeReason.trim()
          ? { changeReason: entryForm.changeReason.trim() }
          : {}),
      });
      setSelectedEntryId(result.entry.id);
      setNotice(
        `Saved ${result.entry.key} at version ${result.entry.currentVersion}`,
      );
      await refreshSelectedEnvironment();
    });

  const createToken = () =>
    runMutation(async () => {
      if (!selectedEnvironmentId) {
        throw new ApiClientError(
          "Create an environment before creating tokens",
          400,
        );
      }

      const result = await apiClient.createConfigServiceToken(
        selectedEnvironmentId,
        {
          name: tokenName,
        },
      );
      setRevealedToken(result.secret);
      setNotice(`Created token ${result.token.name}`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.config.tokens(selectedEnvironmentId),
      });
    });

  const revokeToken = (tokenId: string) =>
    runMutation(async () => {
      await apiClient.revokeConfigServiceToken(tokenId);
      setNotice("Service token revoked");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.config.tokens(selectedEnvironmentId),
      });
    });

  const rollbackEntry = (entry: ConfigEntryDto, targetVersion: number) =>
    runMutation(async () => {
      const result = await apiClient.rollbackConfigEntry(entry.id, {
        targetVersion,
        expectedVersion: entry.currentVersion,
        changeReason: `Dashboard rollback to version ${targetVersion}`,
      });
      setNotice(`Rolled back ${result.entry.key} to version ${targetVersion}`);
      await refreshSelectedEnvironment();
    });

  if (!viewer.organization) {
    return (
      <Alert>
        <AlertTitle>Workspace required</AlertTitle>
        <AlertDescription>
          Create or select an organization before managing configs.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 pt-3 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Dynamic Configuration
          </p>
          <h1 className="mt-1 text-4xl font-semibold leading-none text-slate-950 dark:text-slate-50 md:text-6xl">
            No Reboot HQ
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
            Manage runtime config, publish durable change events, and verify
            live reloads without restarting services.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={liveState === "live" ? "default" : "secondary"}>
            {liveState === "live" ? "SSE live" : liveState}
          </Badge>
          <Button
            variant="secondary"
            onClick={() => void refreshSelectedEnvironment()}
          >
            Refresh
          </Button>
        </div>
      </section>

      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Apps</p>
          <p className={metricValueClassName}>{apps.length}</p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Environment</p>
          <p className="mt-3 truncate text-2xl font-semibold text-slate-950 dark:text-slate-50">
            {selectedEnvironment?.name ?? "None"}
          </p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Revision</p>
          <p className={metricValueClassName}>
            {selectedEnvironment?.revision ?? 0}
          </p>
        </div>
        <div className={metricClassName}>
          <p className={metricLabelClassName}>Tokens</p>
          <p className={metricValueClassName}>{tokens.length}</p>
        </div>
      </section>

      {notice ? (
        <Alert>
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(18rem,0.45fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className={panelClassName}>
            <div className={panelHeaderClassName}>
              <div>
                <h2 className={sectionTitleClassName}>Apps</h2>
                <p className={sectionCopyClassName}>
                  Application-level config boundaries.
                </p>
              </div>
            </div>
            <div className={`${panelBodyClassName} space-y-3`}>
              {appsQuery.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : apps.length ? (
                <Select
                  value={selectedAppId ?? undefined}
                  onValueChange={(value: string | null) => {
                    setSelectedAppId(value);
                    setSelectedEnvironmentId(null);
                    setSelectedEntryId(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select app" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {apps.map((app) => (
                        <SelectItem key={app.id} value={app.id}>
                          {app.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Alert>
                  <AlertTitle>No apps yet</AlertTitle>
                  <AlertDescription>
                    Create the first app to start publishing config.
                  </AlertDescription>
                </Alert>
              )}

              {canManage ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createApp();
                  }}
                >
                  <Input
                    placeholder="Billing API"
                    value={appForm.name}
                    onChange={(event) =>
                      setAppForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="billing-api"
                    value={appForm.slug}
                    onChange={(event) =>
                      setAppForm((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || !appForm.name.trim()}
                  >
                    Create app
                  </Button>
                </form>
              ) : null}
            </div>
          </div>

          <div className={panelClassName}>
            <div className={panelHeaderClassName}>
              <div>
                <h2 className={sectionTitleClassName}>Environments</h2>
                <p className={sectionCopyClassName}>
                  Dev, staging, production, or custom lanes.
                </p>
              </div>
            </div>
            <div className={`${panelBodyClassName} space-y-3`}>
              {environmentsQuery.isPending && selectedAppId ? (
                <Skeleton className="h-10 w-full" />
              ) : environments.length ? (
                <Select
                  value={selectedEnvironmentId ?? undefined}
                  onValueChange={(value: string | null) => {
                    setSelectedEnvironmentId(value);
                    setSelectedEntryId(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {environments.map((environment) => (
                        <SelectItem key={environment.id} value={environment.id}>
                          {environment.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Alert>
                  <AlertTitle>No environments</AlertTitle>
                  <AlertDescription>
                    Add one environment for {selectedApp?.name ?? "this app"}.
                  </AlertDescription>
                </Alert>
              )}

              {canManage ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createEnvironment();
                  }}
                >
                  <Input
                    value={environmentForm.name}
                    onChange={(event) =>
                      setEnvironmentForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <Input
                    value={environmentForm.slug}
                    onChange={(event) =>
                      setEnvironmentForm((current) => ({
                        ...current,
                        slug: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full"
                    disabled={
                      isSubmitting ||
                      !selectedAppId ||
                      !environmentForm.name.trim()
                    }
                  >
                    Add environment
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className={panelClassName}>
            <div className={panelHeaderClassName}>
              <div>
                <h2 className={sectionTitleClassName}>Config Entries</h2>
                <p className={sectionCopyClassName}>
                  Values are versioned. Secret entries are masked in the
                  dashboard.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              {entriesQuery.isPending && selectedEnvironmentId ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : entries.length ? (
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Key</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Value</th>
                      <th className="px-4 py-3 font-semibold">Version</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="cursor-pointer bg-white transition-colors hover:bg-slate-50 dark:bg-slate-950/60 dark:hover:bg-slate-900"
                        onClick={() => {
                          setSelectedEntryId(entry.id);
                          setEntryForm((current) => ({
                            ...current,
                            key: entry.key,
                            valueType: entry.valueType,
                            value: stringifyValue(entry.value),
                            description: entry.description ?? "",
                          }));
                        }}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-slate-950 dark:text-slate-50">
                          {entry.key}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              entry.valueType === "secret"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {entry.valueType}
                          </Badge>
                        </td>
                        <td className="max-w-sm truncate px-4 py-3 text-slate-600 dark:text-slate-300">
                          {stringifyValue(entry.value)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          v{entry.currentVersion}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={panelBodyClassName}>
                  <Alert>
                    <AlertTitle>No config entries</AlertTitle>
                    <AlertDescription>
                      Write the first key to produce a durable config event.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          </div>

          {canManage ? (
            <div className={panelClassName}>
              <div className={panelHeaderClassName}>
                <div>
                  <h2 className={sectionTitleClassName}>Write Config</h2>
                  <p className={sectionCopyClassName}>
                    Existing keys use optimistic concurrency with the current
                    version.
                  </p>
                </div>
              </div>
              <form
                className={`${panelBodyClassName} grid gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_12rem_minmax(16rem,1fr)_auto]`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEntry();
                }}
              >
                <Input
                  value={entryForm.key}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      key: event.target.value,
                    }))
                  }
                  placeholder="FEATURE_FLAG"
                />
                <Select
                  value={entryForm.valueType}
                  onValueChange={(value: string | null) => {
                    if (!value) return;
                    setEntryForm((current) => ({
                      ...current,
                      valueType: value as ConfigValueType,
                    }));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {valueTypes.map((valueType) => (
                        <SelectItem key={valueType} value={valueType}>
                          {valueType}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  value={entryForm.value}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      value: event.target.value,
                    }))
                  }
                  placeholder="true"
                />
                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedEnvironmentId}
                >
                  Save
                </Button>
                <textarea
                  className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none ring-offset-background placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus-visible:ring-slate-300 lg:col-span-4"
                  value={entryForm.changeReason}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      changeReason: event.target.value,
                    }))
                  }
                  placeholder="Change reason"
                />
              </form>
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Version History</h2>
              <p className={sectionCopyClassName}>
                {selectedEntry
                  ? selectedEntry.key
                  : "Select an entry to inspect immutable versions."}
              </p>
            </div>
          </div>
          <div>
            {versionsQuery.isPending && selectedEntryId ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : versionsQuery.data?.items.length ? (
              versionsQuery.data.items.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-950 dark:text-slate-50">
                      v{version.version} · {version.valueType}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                      {version.changeReason ?? "No change reason"} ·{" "}
                      {new Date(version.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {selectedEntry && canManage ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        version.version === selectedEntry.currentVersion ||
                        isSubmitting
                      }
                      onClick={() =>
                        void rollbackEntry(selectedEntry, version.version)
                      }
                    >
                      Rollback
                    </Button>
                  ) : null}
                </div>
              ))
            ) : (
              <div className={panelBodyClassName}>
                <Alert>
                  <AlertTitle>No version selected</AlertTitle>
                  <AlertDescription>
                    Pick an entry from the config table.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </div>

        <div className={panelClassName}>
          <div className={panelHeaderClassName}>
            <div>
              <h2 className={sectionTitleClassName}>Service Tokens</h2>
              <p className={sectionCopyClassName}>
                Scoped credentials for runtime config clients.
              </p>
            </div>
          </div>
          <div className={`${panelBodyClassName} space-y-4`}>
            {revealedToken ? (
              <Alert>
                <AlertTitle>Copy this token now</AlertTitle>
                <AlertDescription>
                  <code className="mt-2 block break-all rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                    {revealedToken}
                  </code>
                </AlertDescription>
              </Alert>
            ) : null}

            {canManage ? (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createToken();
                }}
              >
                <Input
                  value={tokenName}
                  onChange={(event) => setTokenName(event.target.value)}
                  placeholder="production simulator"
                />
                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedEnvironmentId}
                >
                  Create token
                </Button>
              </form>
            ) : null}

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {tokensQuery.isPending && selectedEnvironmentId ? (
                <Skeleton className="h-12 w-full" />
              ) : tokens.length ? (
                tokens.map((token) => (
                  <div
                    key={token.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950 dark:text-slate-50">
                        {token.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {token.tokenPrefix}... ·{" "}
                        {token.active ? "active" : "revoked"}
                      </p>
                    </div>
                    {canManage && token.active ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isSubmitting}
                        onClick={() => void revokeToken(token.id)}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Badge variant="outline">inactive</Badge>
                    )}
                  </div>
                ))
              ) : (
                <Alert>
                  <AlertTitle>No service tokens</AlertTitle>
                  <AlertDescription>
                    Create one for the simulator or backend clients.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={panelClassName}>
        <div className={panelHeaderClassName}>
          <div>
            <h2 className={sectionTitleClassName}>Live Propagation</h2>
            <p className={sectionCopyClassName}>
              Redpanda-backed SSE stream for the selected environment.
            </p>
          </div>
        </div>
        <div className={panelBodyClassName}>
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-100">
            {lastEvent
              ? JSON.stringify(lastEvent, null, 2)
              : JSON.stringify(
                  { status: liveState, environmentId: selectedEnvironmentId },
                  null,
                  2,
                )}
          </pre>
        </div>
      </section>
    </div>
  );
}
