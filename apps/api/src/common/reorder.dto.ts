import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/**
 * Body for the per-entity `PATCH /<entity>/reorder` endpoints.
 * `ids` is the full, newly-ordered list of row ids as the user sees them
 * after a drag-and-drop; each id is persisted with its array index as
 * `sortOrder`. Ids outside the caller's visibility scope are ignored.
 */
export class ReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
