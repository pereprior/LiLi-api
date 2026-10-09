import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { Authenticated } from '#src/auth/decorators/authenticated-session.decorator.js';
import type { AuthenticatedSession } from '#src/auth/types/authenticated-session.type.js';
import { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import type { DeleteResponse } from '#src/shared/responses/delete.response.js';
import { ChangeTaskStatusDto } from '#src/tasks/dto/change-task-status.dto.js';
import { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import { UpdateTaskDetailsDto } from '#src/tasks/dto/update-task-details.dto.js';
import { TaskResponseMapper } from '#src/tasks/mappers/task-response.mapper.js';
import type { TaskResponse } from '#src/tasks/responses/task.response.js';
import { CreateTaskService } from '#src/tasks/services/create-task/create-task.service.js';
import { DeleteTaskService } from '#src/tasks/services/delete-task/delete-task.service.js';
import { FindAllTasksService } from '#src/tasks/services/find-all-tasks/find-all-tasks.service.js';
import { FindTaskByUuidService } from '#src/tasks/services/find-task-by-uuid/find-task-by-uuid.service.js';
import { UpdateTaskDetailsService } from '#src/tasks/services/update-task-details/update-task-details.service.js';
import { UpdateTaskStatusService } from '#src/tasks/services/update-task-status/update-task-status.service.js';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly createTask: CreateTaskService,
    private readonly findAllTasks: FindAllTasksService,
    private readonly findTaskByUuid: FindTaskByUuidService,
    private readonly updateTaskDetails: UpdateTaskDetailsService,
    private readonly updateTaskStatus: UpdateTaskStatusService,
    private readonly deleteTask: DeleteTaskService,
  ) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(
    @Authenticated() session: AuthenticatedSession,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    const task = await this.createTask.execute(
      { uuid: session.user.uuid },
      dto,
    );
    return TaskResponseMapper.toResponse(task);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async findAll(
    @Authenticated() session: AuthenticatedSession,
  ): Promise<TaskResponse[]> {
    const tasks = await this.findAllTasks.execute({ uuid: session.user.uuid });
    return TaskResponseMapper.toListResponse(tasks);
  }

  @Get(':uuid')
  @Header('Cache-Control', 'no-store')
  async findByUuid(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
  ): Promise<TaskResponse> {
    const task = await this.findTaskByUuid.execute(
      { uuid: session.user.uuid },
      uuidDto,
    );
    return TaskResponseMapper.toResponse(task);
  }

  @Patch(':uuid')
  @Header('Cache-Control', 'no-store')
  async updateDetails(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
    @Body() dto: UpdateTaskDetailsDto,
  ): Promise<TaskResponse> {
    const task = await this.updateTaskDetails.execute(
      { uuid: session.user.uuid },
      uuidDto,
      dto,
    );
    return TaskResponseMapper.toResponse(task);
  }

  @Patch(':uuid/status')
  @Header('Cache-Control', 'no-store')
  async updateStatus(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
    @Body() dto: ChangeTaskStatusDto,
  ): Promise<TaskResponse> {
    const task = await this.updateTaskStatus.execute(
      { uuid: session.user.uuid },
      uuidDto,
      dto,
    );
    return TaskResponseMapper.toResponse(task);
  }

  @Delete(':uuid')
  @Header('Cache-Control', 'no-store')
  async delete(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
  ): Promise<DeleteResponse> {
    return this.deleteTask.execute({ uuid: session.user.uuid }, uuidDto);
  }
}
