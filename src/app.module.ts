import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '#src/auth/auth.module.js';
import {
  authConfig,
  validateEnvironment,
} from '#src/auth/config/auth.config.js';
import { getEnvironmentFilePath } from '#src/config/environment.config.js';
import { DatabaseModule } from '#src/database/database.module.js';
import { TasksModule } from '#src/tasks/tasks.module.js';

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
    TasksModule,
  ],
})
export class AppModule {}
