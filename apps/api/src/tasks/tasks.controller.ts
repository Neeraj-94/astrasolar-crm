import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { TasksService } from './tasks.service';
import {
  CreateTaskCommentDto,
  CreateTaskDto,
  CreateTaskListDto,
  MoveTaskDto,
  RenameTaskListDto,
  ReorderTaskListsDto,
  TASK_BOARD_KEYS,
  UpdateTaskDto,
  type TaskBoardKeyValue,
} from './dto';

const parseBoard = (v: string | undefined): TaskBoardKeyValue => {
  if (!v || !(TASK_BOARD_KEYS as readonly string[]).includes(v)) {
    throw new BadRequestException(
      `board must be one of: ${TASK_BOARD_KEYS.join(', ')}`,
    );
  }
  return v as TaskBoardKeyValue;
};

/**
 * Task Overview boards. Every staff role can hold tasks, so routes are gated
 * by the baseline staff permission; per-board access (which dashboard the
 * board belongs to) is enforced in TasksService.assertBoardAccess.
 */
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('board')
  getBoard(@CurrentUser() user: AuthUser, @Query('board') board?: string) {
    return this.tasks.getBoard(user, parseBoard(board));
  }

  /** Users the current user may assign tasks to (role-based policy + self). */
  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('assignees')
  listAssignees(@CurrentUser() user: AuthUser) {
    return this.tasks.listAssignees(user);
  }

  // -- lists ------------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post('lists')
  createList(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskListDto) {
    return this.tasks.createList(user, dto.board, dto.name);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Patch('lists/reorder')
  reorderLists(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderTaskListsDto,
  ) {
    return this.tasks.reorderLists(user, dto.board, dto.ids);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Patch('lists/:id')
  renameList(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RenameTaskListDto,
  ) {
    return this.tasks.renameList(user, id, dto.name);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Delete('lists/:id')
  deleteList(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.deleteList(user, id);
  }

  // -- tasks ------------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post()
  createTask(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.createTask(user, dto);
  }

  /** Nudge the assignee (in-app indicator; max one per task per hour). */
  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post(':id/nudge')
  nudgeTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.nudgeTask(user, id);
  }

  // -- comments ---------------------------------------------------------------
  // Registered before the generic ":id" routes so "comments/:commentId" is not
  // captured by the ":id" param.

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Delete('comments/:commentId')
  deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('commentId') commentId: string,
  ) {
    return this.tasks.deleteComment(user, commentId);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get(':id/comments')
  listComments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.listComments(user, id);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post(':id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.tasks.addComment(user, id, dto.body);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Patch(':id/move')
  moveTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasks.moveTask(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Patch(':id')
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.updateTask(user, id, dto);
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Delete(':id')
  deleteTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.deleteTask(user, id);
  }
}
