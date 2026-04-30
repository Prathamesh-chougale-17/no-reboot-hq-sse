import { loadAsyncPlatformEnv, type AsyncPlatformEnv } from "@acme/config";
import { ConfigEventDtoSchema, type ConfigEventDto } from "@acme/shared";
import { Kafka, logLevel, type Consumer, type Producer } from "kafkajs";

export type ConfigEventHandler = (
  event: ConfigEventDto,
) => void | Promise<void>;

const producerCache = new Map<string, Producer>();

const splitBrokers = (brokers: string | undefined): string[] =>
  (brokers ?? "")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);

const getKafkaKey = (env: AsyncPlatformEnv) =>
  splitBrokers(env.KAFKA_BROKERS).join(",");

export const isConfigEventStreamingConfigured = (
  source: Record<string, string | undefined> = process.env,
): boolean =>
  splitBrokers(loadAsyncPlatformEnv(source).KAFKA_BROKERS).length > 0;

export const createConfigKafka = (
  env = loadAsyncPlatformEnv(process.env),
): Kafka | null => {
  const brokers = splitBrokers(env.KAFKA_BROKERS);

  if (brokers.length === 0) {
    return null;
  }

  return new Kafka({
    clientId: "no-reboot-hq",
    brokers,
    logLevel: logLevel.NOTHING,
  });
};

export const ensureConfigEventsTopic = async (
  env = loadAsyncPlatformEnv(process.env),
): Promise<void> => {
  const kafka = createConfigKafka(env);

  if (!kafka) {
    return;
  }

  const admin = kafka.admin();
  await admin.connect();

  try {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: env.CONFIG_EVENTS_TOPIC,
          numPartitions: 3,
          replicationFactor: 1,
        },
      ],
    });
  } finally {
    await admin.disconnect();
  }
};

const getProducer = async (
  env = loadAsyncPlatformEnv(process.env),
): Promise<Producer | null> => {
  const kafka = createConfigKafka(env);

  if (!kafka) {
    return null;
  }

  const key = getKafkaKey(env);
  const cached = producerCache.get(key);

  if (cached) {
    return cached;
  }

  const producer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
  });
  await producer.connect();
  producerCache.set(key, producer);

  return producer;
};

export const publishConfigEvent = async (
  event: ConfigEventDto,
  env = loadAsyncPlatformEnv(process.env),
): Promise<boolean> => {
  const parsed = ConfigEventDtoSchema.parse(event);
  const producer = await getProducer(env);

  if (!producer) {
    return false;
  }

  await producer.send({
    topic: env.CONFIG_EVENTS_TOPIC,
    messages: [
      {
        key: parsed.environmentId ?? parsed.appId ?? parsed.organizationId,
        value: JSON.stringify(parsed),
        headers: {
          eventType: parsed.eventType,
          organizationId: parsed.organizationId,
        },
      },
    ],
  });

  return true;
};

export const subscribeToConfigEvents = async ({
  groupId,
  signal,
  onEvent,
  env = loadAsyncPlatformEnv(process.env),
}: {
  groupId: string;
  signal: AbortSignal;
  onEvent: ConfigEventHandler;
  env?: AsyncPlatformEnv;
}): Promise<Consumer | null> => {
  const kafka = createConfigKafka(env);

  if (!kafka) {
    return null;
  }

  const consumer = kafka.consumer({
    groupId,
    allowAutoTopicCreation: false,
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: env.CONFIG_EVENTS_TOPIC,
    fromBeginning: false,
  });

  signal.addEventListener(
    "abort",
    () => {
      void consumer.disconnect();
    },
    {
      once: true,
    },
  );

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      const parsed = ConfigEventDtoSchema.safeParse(
        JSON.parse(message.value.toString()),
      );

      if (parsed.success) {
        await onEvent(parsed.data);
      }
    },
  });

  return consumer;
};

export const closeConfigEventProducers = async (): Promise<void> => {
  await Promise.all(
    [...producerCache.values()].map((producer) => producer.disconnect()),
  );
  producerCache.clear();
};
