/** The HTML id of a changelog entry on the /changelog page. */
export const entryAnchor = (entryId: string) => `e-${entryId}`;

/** Link to one entry on the changelog page; `base` is the board root (origin + "/<slug>", or just "/<slug>"). */
export const changelogEntryUrl = (base: string, entryId: string) => `${base}/changelog#${entryAnchor(entryId)}`;
