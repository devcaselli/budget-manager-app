/**
 * A tag with at most 1 level of hierarchy: a root tag (`parentId === null`) or a subtag of a
 * root (`parentId` set). Backend rejects subtag-of-subtag (`TagHierarchyViolationException`,
 * mapped to HTTP 422) — the frontend never offers a subtag as "parent tag" in pickers.
 */
export interface Tag {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export interface SaveTagRequest {
  readonly name: string;
  readonly parentId?: string | null;
}

/** Backend PUT /tags/{id} is a full replace, not a partial patch — name is required. */
export interface UpdateTagRequest {
  readonly name: string;
  readonly parentId?: string | null;
}

/** A root tag with its direct subtags, for grouped rendering (1 level only, no recursion). */
export interface TagGroup {
  readonly root: Tag;
  readonly subtags: readonly Tag[];
}
