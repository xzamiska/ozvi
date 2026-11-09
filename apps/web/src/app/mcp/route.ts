import type { NextRequest } from "next/server";
import { handleMcp } from "@/lib/mcp-handler";

export const dynamic = "force-dynamic";
const handle = (req: NextRequest) => handleMcp(req);
export { handle as GET, handle as POST, handle as DELETE };
