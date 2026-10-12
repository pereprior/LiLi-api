import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { LiliService } from '#src/actions/services/lili/lili.service.js';
import { Authenticated } from '#src/auth/decorators/authenticated-session.decorator.js';
import type { AuthenticatedSession } from '#src/auth/types/authenticated-session.type.js';
import { ParamUuidDto } from '#src/shared/dto/param-uuid.dto.js';
import type { DeleteResponse } from '#src/shared/responses/delete.response.js';
import { CreateTaskDto } from '#src/tasks/dto/create-task.dto.js';
import { FindTasksDto } from '#src/tasks/dto/find-tasks.dto.js';
import { UpdateTaskDetailsDto } from '#src/tasks/dto/update-task-details.dto.js';
import { UpdateTaskStatusDto } from '#src/tasks/dto/update-task-status.dto.js';
import { TaskResponseMapper } from '#src/tasks/mappers/task-response.mapper.js';
import type { TaskResponse } from '#src/tasks/responses/task.response.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly lili: LiliService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async create(
    @Authenticated() session: AuthenticatedSession,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    const { result: task } = await this.lili.execute({
      actor: { uuid: session.user.uuid },
      action: 'tasks.create',
      payload: dto,
    });
    return TaskResponseMapper.toResponse(task);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async findAll(
    @Authenticated() session: AuthenticatedSession,
    @Query() dto: FindTasksDto = {},
  ): Promise<TaskResponse[]> {
    const { result: tasks } = await this.lili.execute({
      actor: { uuid: session.user.uuid },
      action: 'tasks.findAll',
      payload: dto,
    });
    return TaskResponseMapper.toListResponse(tasks);
  }

  @Get(':uuid')
  @Header('Cache-Control', 'no-store')
  async findByUuid(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
  ): Promise<TaskResponse> {
    const { result: task } = await this.lili.execute({
      actor: { uuid: session.user.uuid },
      action: 'tasks.findByUuid',
      payload: uuidDto,
    });
    return TaskResponseMapper.toResponse(task);
  }

  @Patch(':uuid')
  @Header('Cache-Control', 'no-store')
  async updateDetails(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
    @Body() dto: UpdateTaskDetailsDto,
  ): Promise<TaskResponse> {
    const { result: task } = await this.lili.execute({
      actor: { uuid: session.user.uuid },
      action: 'tasks.updateDetails',
      payload: { ...dto, uuid: uuidDto.uuid },
    });
    return TaskResponseMapper.toResponse(task);
  }

  @Patch(':uuid/status')
  @Header('Cache-Control', 'no-store')
  async updateStatus(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
    @Body() dto: UpdateTaskStatusDto,
  ): Promise<TaskResponse> {
    const { result: task } = await this.lili.execute({
      actor: { uuid: session.user.uuid },
      action: 'tasks.updateStatus',
      payload: { ...dto, uuid: uuidDto.uuid },
    });
    return TaskResponseMapper.toResponse(task);
  }

  @Delete(':uuid')
  @Header('Cache-Control', 'no-store')
  async delete(
    @Authenticated() session: AuthenticatedSession,
    @Param() uuidDto: ParamUuidDto,
  ): Promise<DeleteResponse> {
    const { result } = await this.lili.execute({
      actor: { uuid: session.user.uuid },
      action: 'tasks.delete',
      payload: uuidDto,
    });
    return result;
  }
}
