/**
 * The MCP tools of packages/mcp/src/index.ts as /docs/mcp lists them, with the scope each one needs
 * (mcp-tools.test.ts keeps the list in step with the server).
 */
export const MCP_TOOLS: [name: string, scope: string, what: string][] = [
  ["search_feedback", "read", "Search ideas and bugs by text, kind, status or tag. With unanswered=true (triage): the team's queue of items waiting for a reply."],
  ["get_item", "read", "One idea or bug with comments, attachments and, for bugs, the captured browser context."],
  ["list_tags", "read", "The board's tags (team-only tags for team tokens only)."],
  ["top_requests", "read", "Most-voted ideas not yet shipped or declined; with triage also the demand behind each (companies, MRR) and sorting by MRR."],
  ["summarize", "read", "Numbers and the most relevant items for the last N days, as material for a summary."],
  ["find_duplicates", "read", "Items similar to an item or a piece of text."],
  ["find_similar", "read", "Closest existing ideas and bugs to a text, with a score; call before filing anything new."],
  ["list_updates", "read", "Published changelog entries; drafts with the triage scope."],
  ["create_item", "write", "File an idea or a bug report as the token's owner; the answer lists likely duplicates."],
  ["add_comment", "write", "Comment on an item; internal notes need triage."],
  ["submit_insight", "triage", "Record what a customer asked for (ticket, call, review): a vote and a note on a matching idea, or a new idea waiting for moderation."],
  ["set_tags", "triage", "Set, add or remove existing tags on an item."],
  ["set_status", "triage", "Change an item's stage; fixed with a version asks the reporter to confirm the fix."],
  ["link_issue", "triage", "Link an item to a GitHub issue, or open a new one from it."],
  ["merge_items", "triage", "Merge a duplicate into the original (votes and voters move). Needs confirmation."],
  ["publish_update", "triage", "Publish a changelog entry and e-mail the voters of the shipped ideas. Needs confirmation."],
  ["publish_draft", "triage", "Publish an existing changelog draft as it is. Needs confirmation."],
];
