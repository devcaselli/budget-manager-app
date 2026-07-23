/** Generic tag chip shape rendered in list rows — `{id, name}`. */
export interface TagChip {
  readonly id: string;
  readonly name: string;
}

/** Chip label shown when a tagId has no match in the current tag map (e.g. tags$ hasn't
 * resolved yet, or the tag was deleted after being assigned). Never renders a raw UUID. */
const UNKNOWN_TAG_LABEL = '—';

/**
 * Resolves a list of assigned tag ids into display chips via a tagId→name map.
 * Shared by Expense/Installment/Subscription list pages — all three build chips the exact
 * same way (`tagMap.get(id) ?? id`), which was previously triplicated and leaked the raw
 * UUID into the UI on a map miss instead of a neutral placeholder.
 */
export function toTagChips(tagIds: readonly string[], tagMap: ReadonlyMap<string, string>): readonly TagChip[] {
  return tagIds.map((id) => ({ id, name: tagMap.get(id) ?? UNKNOWN_TAG_LABEL }));
}
