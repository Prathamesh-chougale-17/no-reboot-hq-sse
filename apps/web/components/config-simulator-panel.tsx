"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ConfigEventDtoSchema,
  ConfigSnapshotDtoSchema,
  type ApiResponse,
  type ConfigEventDto,
  type ConfigSnapshotDto,
} from "@acme/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Input,
} from "@acme/ui";

const MAX_LOG_ENTRIES = 50;

const panelClassName =
  "rounded-lg border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-none";
const panelHeaderClassName =
  "flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800";
const panelBodyClassName = "p-4";
const sectionTitleClassName =
  "text-base font-semibold text-slate-950 dark:text-slate-50";
const sectionCopyClassName =
  "mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400";

type SimulatorStatus =
  | "idle"
  | "loading"
  | "connecting"
  | "live"
  | "unavailable"
  | "stopped"
  | "error";

type SimulatorLogType =
  | "snapshot"
  | "connected"
  | "unavailable"
  | "heartbeat-hidden"
  | "change"
  | "error"
  | "manual";

type SimulatorLogLevel = "info" | "success" | "warning" | "error";

type SimulatorLogEntry = {
  id: string;
  timestamp: string;
  type: SimulatorLogType;
  level: SimulatorLogLevel;
  message: string;
  detail?: unknown;
};

type ActiveRun = {
  controller: AbortController;
  runId: string;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete the request";

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const createLogEntry = ({
  type,
  level,
  message,
  detail,
}: Omit<SimulatorLogEntry, "id" | "timestamp">): SimulatorLogEntry => ({
  id: createId(),
  timestamp: new Date().toISOString(),
  type,
  level,
  message,
  detail,
});

const parseApiResponse = async (
  response: Response,
): Promise<ApiResponse<unknown> | undefined> => {
  const text = await response.text();

  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as ApiResponse<unknown>;
  } catch {
    return undefined;
  }
};

const fetchClientSnapshot = async (
  serviceToken: string,
  signal: AbortSignal,
): Promise<ConfigSnapshotDto> => {
  const response = await fetch("/api/v1/client/config", {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${serviceToken}`,
    },
    signal,
  });
  const payload = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(
      payload?.success === false
        ? payload.error.message
        : `Snapshot request failed with HTTP ${response.status}`,
    );
  }

  if (!payload?.success) {
    throw new Error("Snapshot request returned an invalid payload");
  }

  return ConfigSnapshotDtoSchema.parse(payload.data);
};

const parseSseBlock = (
  block: string,
): { event: string; data: string } | null => {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const data: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }

  if (data.length === 0) {
    return null;
  }

  return {
    event,
    data: data.join("\n"),
  };
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const getUnavailableReason = (data: string) => {
  const parsed = parseJson(data);

  if (parsed && typeof parsed === "object" && "reason" in parsed) {
    const reason = (parsed as { reason?: unknown }).reason;
    return typeof reason === "string" && reason.trim()
      ? reason
      : "config_event_streaming_unavailable";
  }

  return data.trim() || "config_event_streaming_unavailable";
};

const formatConfigValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  const json = JSON.stringify(value, null, 2);
  return json ?? String(value);
};

const formatSnapshotTarget = (snapshot: ConfigSnapshotDto) =>
  `${snapshot.app.slug}/${snapshot.environment.slug}`;

const formatEventMessage = (event: ConfigEventDto) => {
  const key = event.entryKey ? ` ${event.entryKey}` : "";
  const revision =
    event.revision === null ? "revision n/a" : `revision ${event.revision}`;
  return `${event.eventType}${key} - ${revision}`;
};

const getStatusBadgeVariant = (status: SimulatorStatus) => {
  if (status === "live") {
    return "default";
  }

  if (status === "error" || status === "unavailable") {
    return "destructive";
  }

  return "secondary";
};

const getLogToneClassName = (level: SimulatorLogLevel) => {
  switch (level) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-slate-400";
  }
};

const watchClientEvents = async ({
  serviceToken,
  signal,
  onConnected,
  onUnavailable,
  onHeartbeatHidden,
  onConfigEvent,
}: {
  serviceToken: string;
  signal: AbortSignal;
  onConnected: () => void;
  onUnavailable: (reason: string) => void;
  onHeartbeatHidden: () => void;
  onConfigEvent: (event: ConfigEventDto) => Promise<void>;
}): Promise<"ended" | "unavailable"> => {
  const response = await fetch("/api/v1/client/config/events", {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${serviceToken}`,
    },
    signal,
  });

  if (!response.ok || !response.body) {
    const payload = await parseApiResponse(response);
    throw new Error(
      payload?.success === false
        ? payload.error.message
        : `Event stream failed with HTTP ${response.status}`,
    );
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let heartbeatLogged = false;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const parsed = parseSseBlock(block);

      if (!parsed) {
        continue;
      }

      if (parsed.event === "heartbeat") {
        if (!heartbeatLogged) {
          heartbeatLogged = true;
          onHeartbeatHidden();
        }
        continue;
      }

      if (parsed.event === "connected") {
        onConnected();
        continue;
      }

      if (parsed.event === "unavailable") {
        onUnavailable(getUnavailableReason(parsed.data));
        return "unavailable";
      }

      const event = ConfigEventDtoSchema.parse(JSON.parse(parsed.data));
      await onConfigEvent(event);
    }
  }

  return "ended";
};

export function ConfigSimulatorPanel() {
  const activeRunRef = useRef<ActiveRun | null>(null);
  const [serviceToken, setServiceToken] = useState("");
  const [status, setStatus] = useState<SimulatorStatus>("idle");
  const [snapshot, setSnapshot] = useState<ConfigSnapshotDto | null>(null);
  const [logs, setLogs] = useState<SimulatorLogEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedToken = serviceToken.trim();
  const configEntries = useMemo(
    () =>
      snapshot
        ? Object.entries(snapshot.config).sort(([leftKey], [rightKey]) =>
            leftKey.localeCompare(rightKey),
          )
        : [],
    [snapshot],
  );

  const appendLog = useCallback(
    (entry: Omit<SimulatorLogEntry, "id" | "timestamp">) => {
      setLogs((current) =>
        [createLogEntry(entry), ...current].slice(0, MAX_LOG_ENTRIES),
      );
    },
    [],
  );

  const stopSimulator = useCallback(
    (message = "Stopped simulator") => {
      if (activeRunRef.current) {
        activeRunRef.current.controller.abort();
        activeRunRef.current = null;
      }

      setStatus("stopped");
      appendLog({
        type: "manual",
        level: "info",
        message,
      });
    },
    [appendLog],
  );

  const clearSimulator = useCallback(() => {
    if (activeRunRef.current) {
      activeRunRef.current.controller.abort();
      activeRunRef.current = null;
    }

    setServiceToken("");
    setStatus("idle");
    setSnapshot(null);
    setLogs([]);
    setErrorMessage(null);
  }, []);

  const startSimulator = useCallback(async () => {
    const token = trimmedToken;

    if (!token) {
      setStatus("error");
      setErrorMessage("Paste a service token before starting the simulator.");
      setLogs([
        createLogEntry({
          type: "error",
          level: "error",
          message: "Missing service token",
        }),
      ]);
      return;
    }

    if (activeRunRef.current) {
      activeRunRef.current.controller.abort();
      activeRunRef.current = null;
    }

    const controller = new AbortController();
    const runId = createId();
    activeRunRef.current = { controller, runId };

    setStatus("loading");
    setSnapshot(null);
    setErrorMessage(null);
    setLogs([
      createLogEntry({
        type: "snapshot",
        level: "info",
        message: "Loading client snapshot",
      }),
    ]);

    const isCurrentRun = () => activeRunRef.current?.runId === runId;

    try {
      const initialSnapshot = await fetchClientSnapshot(
        token,
        controller.signal,
      );

      if (!isCurrentRun()) {
        return;
      }

      setSnapshot(initialSnapshot);
      appendLog({
        type: "snapshot",
        level: "success",
        message: `Loaded ${formatSnapshotTarget(initialSnapshot)} revision ${initialSnapshot.revision}`,
      });

      setStatus("connecting");
      appendLog({
        type: "connected",
        level: "info",
        message: "Opening event stream",
      });

      const streamResult = await watchClientEvents({
        serviceToken: token,
        signal: controller.signal,
        onConnected: () => {
          if (!isCurrentRun()) {
            return;
          }

          setStatus("live");
          appendLog({
            type: "connected",
            level: "success",
            message: "Connected to client event stream",
          });
        },
        onUnavailable: (reason) => {
          if (!isCurrentRun()) {
            return;
          }

          setStatus("unavailable");
          setErrorMessage(reason);
          appendLog({
            type: "unavailable",
            level: "warning",
            message: `Event stream unavailable: ${reason}`,
          });
        },
        onHeartbeatHidden: () => {
          if (!isCurrentRun()) {
            return;
          }

          appendLog({
            type: "heartbeat-hidden",
            level: "info",
            message: "Heartbeat received; future heartbeats stay hidden",
          });
        },
        onConfigEvent: async (event) => {
          if (!isCurrentRun()) {
            return;
          }

          appendLog({
            type: "change",
            level: "success",
            message: formatEventMessage(event),
            detail: event,
          });

          const updatedSnapshot = await fetchClientSnapshot(
            token,
            controller.signal,
          );

          if (!isCurrentRun()) {
            return;
          }

          setSnapshot(updatedSnapshot);
          appendLog({
            type: "snapshot",
            level: "success",
            message: `Snapshot refreshed at revision ${updatedSnapshot.revision}`,
          });
        },
      });

      if (!isCurrentRun()) {
        return;
      }

      if (streamResult === "ended") {
        setStatus("stopped");
        appendLog({
          type: "manual",
          level: "info",
          message: "Event stream ended",
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const message = getErrorMessage(error);
      setStatus("error");
      setErrorMessage(message);
      appendLog({
        type: "error",
        level: "error",
        message,
      });
    } finally {
      if (activeRunRef.current?.runId === runId) {
        activeRunRef.current = null;
      }
    }
  }, [appendLog, trimmedToken]);

  useEffect(
    () => () => {
      activeRunRef.current?.controller.abort();
      activeRunRef.current = null;
    },
    [],
  );

  const handleTokenChange = (value: string) => {
    setServiceToken(value);

    if (activeRunRef.current) {
      stopSimulator("Token changed; stopped simulator");
    }
  };

  const canStop =
    status === "loading" || status === "connecting" || status === "live";
  const isStarting = status === "loading" || status === "connecting";

  return (
    <section className={panelClassName}>
      <div className={panelHeaderClassName}>
        <div>
          <h2 className={sectionTitleClassName}>Client Simulator</h2>
          <p className={sectionCopyClassName}>
            Paste a service token to inspect the runtime snapshot and follow
            live config events.
          </p>
        </div>
        <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
      </div>

      <div className={`${panelBodyClassName} space-y-5`}>
        <form
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void startSimulator();
          }}
        >
          <div className="min-w-0">
            <label className="sr-only" htmlFor="config-simulator-token">
              Service token
            </label>
            <Input
              id="config-simulator-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="nrhq_service_token..."
              value={serviceToken}
              onChange={(event) => handleTokenChange(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={!trimmedToken || isStarting}>
            {status === "live" ? "Restart" : "Start"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canStop}
            onClick={() => stopSimulator()}
          >
            Stop
          </Button>
          <Button type="button" variant="ghost" onClick={clearSimulator}>
            Clear
          </Button>
        </form>

        {errorMessage ? (
          <Alert
            variant={
              status === "unavailable" || status === "error"
                ? "destructive"
                : "default"
            }
          >
            <AlertTitle>
              {status === "unavailable"
                ? "Event stream unavailable"
                : "Simulator notice"}
            </AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 border-y border-slate-200 py-3 text-sm dark:border-slate-800 md:grid-cols-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
              Target
            </p>
            <p className="mt-1 truncate font-medium text-slate-950 dark:text-slate-50">
              {snapshot ? formatSnapshotTarget(snapshot) : "No snapshot"}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
              Revision
            </p>
            <p className="mt-1 font-medium text-slate-950 dark:text-slate-50">
              {snapshot?.revision ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
              Keys
            </p>
            <p className="mt-1 font-medium text-slate-950 dark:text-slate-50">
              {snapshot ? configEntries.length : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
              Generated
            </p>
            <p className="mt-1 truncate font-medium text-slate-950 dark:text-slate-50">
              {snapshot
                ? new Date(snapshot.generatedAt).toLocaleTimeString()
                : "-"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Current Snapshot
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {snapshot ? `${configEntries.length} keys` : "waiting"}
              </span>
            </div>

            {snapshot ? (
              configEntries.length ? (
                <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  {configEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid gap-2 border-b border-slate-200 p-3 last:border-b-0 dark:border-slate-800 lg:grid-cols-[minmax(10rem,0.45fr)_minmax(0,1fr)]"
                    >
                      <code className="break-all text-xs font-semibold text-slate-950 dark:text-slate-50">
                        {key}
                      </code>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs leading-6 text-slate-100">
                        {formatConfigValue(value)}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <AlertTitle>Snapshot loaded</AlertTitle>
                  <AlertDescription>
                    This environment does not have any config values yet.
                  </AlertDescription>
                </Alert>
              )
            ) : (
              <Alert>
                <AlertTitle>No client snapshot</AlertTitle>
                <AlertDescription>
                  Start the simulator with a service token to load runtime
                  config.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                Event Log
              </h3>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLogs([])}
              >
                Clear log
              </Button>
            </div>

            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
              {logs.length ? (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="border-b border-slate-200 p-3 last:border-b-0 dark:border-slate-800"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${getLogToneClassName(
                          log.level,
                        )}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                            {log.type}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
                          {log.message}
                        </p>
                        {log.detail ? (
                          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                            {JSON.stringify(log.detail, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
                  Start the simulator to collect connection and config-change
                  logs.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
