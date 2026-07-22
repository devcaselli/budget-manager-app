import { Tag, TagGroup } from '../models/tag';

/**
 * Partitions a flat tag list into root tags with their direct subtags attached.
 * Hierarchy is capped at 1 level (enforced by the backend), so this never recurses.
 * O(n) — one Map build pass, one grouping pass.
 */
export function groupTagsByParent(tags: readonly Tag[]): readonly TagGroup[] {
  const subtagsByParentId = new Map<string, Tag[]>();

  for (const tag of tags) {
    if (tag.parentId === null) continue;
    const siblings = subtagsByParentId.get(tag.parentId);
    if (siblings) {
      siblings.push(tag);
    } else {
      subtagsByParentId.set(tag.parentId, [tag]);
    }
  }

  return tags
    .filter((tag) => tag.parentId === null)
    .map((root) => ({ root, subtags: subtagsByParentId.get(root.id) ?? [] }));
}
