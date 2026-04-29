import type { ApiEnv } from '@acme/config';
import type { UsersRepository } from '@acme/db';
import { APP_VERSION, type HealthDto } from '@acme/shared';

export class HealthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly env: ApiEnv,
  ) {}

  async getHealth(): Promise<HealthDto> {
    let databaseStatus: HealthDto['checks']['database']['status'] = 'up';
    let databaseDetail = 'Database connection healthy';

    try {
      await this.usersRepository.ping();
    } catch {
      databaseStatus = 'degraded';
      databaseDetail = 'Database health check failed';
    }

    return {
      service: this.env.API_SERVICE_NAME,
      environment: this.env.NODE_ENV,
      version: APP_VERSION,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
      checks: {
        api: {
          status: 'up',
          detail: 'API server accepting requests',
        },
        database: {
          status: databaseStatus,
          detail: databaseDetail,
        },
        observability: {
          status: this.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 'up' : 'degraded',
          detail: this.env.OTEL_EXPORTER_OTLP_ENDPOINT
            ? 'OTLP trace exporter configured'
            : 'OTLP trace exporter missing',
        },
      },
    };
  }
}
