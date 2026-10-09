import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { AppLogger } from '#src/shared/logging/app-logger.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new AppLogger('PrismaService');

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Starting database connection.');
    try {
      await this.$connect();
      this.logger.log('Successfully completed database connection.');
    } catch (error) {
      this.logger.error('Failed database connection.', undefined, {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Starting database disconnection.');
    try {
      await this.$disconnect();
      this.logger.log('Successfully completed database disconnection.');
    } catch (error) {
      this.logger.error('Failed database disconnection.', undefined, {
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw error;
    }
  }
}
