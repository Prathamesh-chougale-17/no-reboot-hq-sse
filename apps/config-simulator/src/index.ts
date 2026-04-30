import {
  ConfigEventDtoSchema,
  ConfigSnapshotDtoSchema,
  type ApiResponse,
} from "@acme/shared";

const API_BASE_URL = (
  process.env.CONFIG_SIMULATOR_API_BASE_URL ?? "http://localhost:3001"
).replace(/\/+$/, "");
const SERVICE_TOKEN = process.env.CONFIG_SERVICE_TOKEN;
const REQUEST_TIMEOUT_MS = 20_000;

if (!SERVICE_TOKEN) {
  console.error(
    "[config-simulator] CONFIG_SERVICE_TOKEN is required. Create a service token in No Reboot HQ and export it before running the simulator.",
  );
  process.exit(1);
}

const request = async (path: string): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const loadSnapshot = async () => {
  const response = await request("/api/v1/client/config");
  const payload = (await response.json()) as ApiResponse<unknown>;

  if (!response.ok || !payload.success) {
    throw new Error(
      payload.success ? "Config snapshot failed" : payload.error.message,
    );
  }

  const snapshot = ConfigSnapshotDtoSchema.parse(payload.data);
  console.log(
    `[config-simulator] loaded ${snapshot.app.slug}/${snapshot.environment.slug} revision ${snapshot.revision}`,
  );
  console.log(JSON.stringify(snapshot.config, null, 2));
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

const watchEvents = async () => {
  const response = await request("/api/v1/client/config/events");

  if (!response.ok || !response.body) {
    throw new Error(`Config event stream failed with HTTP ${response.status}`);
  }

  console.log(
    "[config-simulator] watching config events; update a value in the dashboard.",
  );

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

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

      if (!parsed || parsed.event === "heartbeat") {
        continue;
      }

      if (parsed.event === "connected") {
        console.log("[config-simulator] connected to event stream");
        continue;
      }

      const event = ConfigEventDtoSchema.parse(JSON.parse(parsed.data));
      console.log(
        `[config-simulator] ${event.eventType} ${event.entryKey ?? ""} revision ${event.revision ?? "n/a"}`,
      );
      await loadSnapshot();
    }
  }
};

process.on("SIGINT", () => {
  console.log("\n[config-simulator] stopped");
  process.exit(0);
});

await loadSnapshot();
await watchEvents();
