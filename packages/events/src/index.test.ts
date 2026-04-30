import { describe, expect, it } from "vitest";

import { isConfigEventStreamingConfigured } from "./index";

describe("config events", () => {
  it("detects missing Kafka-compatible brokers", () => {
    expect(isConfigEventStreamingConfigured({})).toBe(false);
  });

  it("detects configured Redpanda brokers", () => {
    expect(
      isConfigEventStreamingConfigured({
        KAFKA_BROKERS: "localhost:19092",
      }),
    ).toBe(true);
  });
});
