import { fileURLToPath, URL } from 'node:url';

import dotenv from 'dotenv';
import { configDefaults, defineConfig } from 'vitest/config';

const testEnvironment = dotenv.config({
  path: '.env.test',
  quiet: true,
}).parsed;

export default defineConfig({
  resolve: {
    alias: {
      '#src': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/types/**',
        'src/auth/google-login/oidc/clients/google-oidc.client.ts',
      ],
      reporter: ['text', 'html', 'lcovonly'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    environment: 'node',
    exclude: [...configDefaults.exclude, 'dist/**'],
    projects: [
      {
        test: {
          name: 'unit',
          setupFiles: ['./test/setup.ts'],
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          setupFiles: ['./test/setup.ts'],
          env: testEnvironment,
          fileParallelism: false,
          include: ['test/**/*.e2e-spec.ts'],
        },
      },
    ],
  },
});
