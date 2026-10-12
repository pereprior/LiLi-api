import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ActionsModule } from '#src/actions/actions.module.js';
import { AuthModule } from '#src/auth/auth.module.js';
import {
  authConfig,
  validateEnvironment,
} from '#src/auth/config/auth.config.js';
import { getEnvironmentFilePath } from '#src/config/environment.config.js';
import { DatabaseModule } from '#src/database/database.module.js';
import { RemindersModule } from '#src/reminders/reminders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [getEnvironmentFilePath()],
      expandVariables: true,
      load: [authConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    ActionsModule,
    RemindersModule,
  ],
})
export class AppModule {}
