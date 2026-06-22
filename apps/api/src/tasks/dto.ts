import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Dashboards that own a shared task board. */
export const TASK_BOARD_KEYS = [
  'leads',
  'sales',
  'sales-manager',
  'operations-manager',
  'admin',
] as const;
export type TaskBoardKeyValue = (typeof TASK_BOARD_KEYS)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export class CreateTaskListDto {
  @IsIn(TASK_BOARD_KEYS) board!: TaskBoardKeyValue;
  @IsString() @MaxLength(80) name!: string;
}

export class RenameTaskListDto {
  @IsString() @MaxLength(80) name!: string;
}

export class ReorderTaskListsDto {
  @IsIn(TASK_BOARD_KEYS) board!: TaskBoardKeyValue;
  @IsString({ each: true }) ids!: string[];
}

export class CreateTaskDto {
  @IsIn(TASK_BOARD_KEYS) board!: TaskBoardKeyValue;
  @IsString() listId!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsIn(TASK_PRIORITIES) priority?: TaskPriorityValue;
  @IsOptional() @Matches(ISO_DATE) dueDate?: string | null;
  @IsOptional() @IsString() assigneeId?: string | null;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsIn(TASK_PRIORITIES) priority?: TaskPriorityValue;
  @IsOptional() @Matches(ISO_DATE) dueDate?: string | null;
  @IsOptional() @IsString() assigneeId?: string | null;
}

export class MoveTaskDto {
  @IsString() listId!: string;
  @IsInt() @Min(0) position!: number;
}
