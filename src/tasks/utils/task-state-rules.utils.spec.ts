import { TaskStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { TaskEntity } from '#src/tasks/entities/task.entity.js';
import { TaskDateEntity } from '#src/tasks/entities/task-date.entity.js';
import { TaskConflictException } from '#src/tasks/exceptions/task-conflict.exception.js';
import { TaskValidationException } from '#src/tasks/exceptions/task-validation.exception.js';
import { TaskStateRulesUtils } from '#src/tasks/utils/task-state-rules.utils.js';

const statuses = Object.values(TaskStatus);
const allowedStatuses: Record<TaskStatus, readonly TaskStatus[]> = {
  PENDING: ['PENDING'],
  SCHEDULED: ['PENDING', 'SCHEDULED'],
  IN_PROGRESS: statuses,
  PAUSED: statuses,
  BLOCKED: statuses,
  COMPLETED: ['COMPLETED', 'CANCELLED'],
  CANCELLED: ['CANCELLED'],
};

describe('TaskStateRulesUtils', () => {
  describe('Immutability', () => {
    it.each(['COMPLETED', 'CANCELLED'] as const)(
      'prevents editing a %s task',
      (status) => {
        const task = new TaskEntity(
          'task-1',
          'user-1',
          null,
          'Dinner',
          null,
          status,
          null,
          null,
          null,
          null,
        );

        expect(() => TaskStateRulesUtils.assertEditable(task)).toThrow(
          new TaskConflictException(
            'Completed and cancelled tasks are immutable.',
          ),
        );
      },
    );

    it.each([
      'PENDING',
      'SCHEDULED',
      'IN_PROGRESS',
      'PAUSED',
      'BLOCKED',
    ] as const)('allows editing a %s task', (status) => {
      const task = new TaskEntity(
        'task-1',
        'user-1',
        null,
        'Dinner',
        null,
        status,
        new TaskDateEntity('2026-10-10'),
        null,
        null,
        null,
      );

      expect(() => TaskStateRulesUtils.assertEditable(task)).not.toThrow();
    });
  });

  describe('Scheduled start', () => {
    it('rejects a scheduled task without a start', () => {
      expect(() =>
        TaskStateRulesUtils.validateScheduledStart('SCHEDULED', null),
      ).toThrow(
        new TaskValidationException('Scheduled tasks require a start date.'),
      );
    });

    it('accepts a scheduled task with a day and no explicit time', () => {
      expect(() =>
        TaskStateRulesUtils.validateScheduledStart(
          'SCHEDULED',
          new TaskDateEntity('2026-10-10'),
        ),
      ).not.toThrow();
    });

    it.each([
      'PENDING',
      'IN_PROGRESS',
      'PAUSED',
      'BLOCKED',
      'COMPLETED',
      'CANCELLED',
    ] as const)('does not require a start for %s', (status) => {
      expect(() =>
        TaskStateRulesUtils.validateScheduledStart(status, null),
      ).not.toThrow();
    });
  });

  describe('Principal and subtask states', () => {
    it.each(
      statuses.flatMap((principalStatus) =>
        statuses.map((subtaskStatus) => ({
          principalStatus,
          subtaskStatus,
          allowed: allowedStatuses[principalStatus].includes(subtaskStatus),
        })),
      ),
    )(
      '$principalStatus principal / $subtaskStatus subtask: allowed=$allowed',
      ({ principalStatus, subtaskStatus, allowed }) => {
        const validate = (): void =>
          TaskStateRulesUtils.validateSubtaskStatus(
            principalStatus,
            subtaskStatus,
          );

        if (allowed) {
          expect(validate).not.toThrow();
        } else {
          expect(validate).toThrow(
            new TaskConflictException(
              `Subtask status ${subtaskStatus} is incompatible with principal status ${principalStatus}.`,
            ),
          );
        }
      },
    );
  });
});
