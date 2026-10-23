/** Subtasks are rendered by their parent, never repeated as root rows. */
export function rootIssueIds<T extends { parent_id?: string | null }>(
  ids: readonly string[],
  issues: Record<string, T | undefined>
): string[] {
  return ids.filter((id) => !issues[id]?.parent_id);
}
