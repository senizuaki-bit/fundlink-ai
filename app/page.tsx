import FundLink from "@/components/fundlink";
import { requireChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() { await requireChatGPTUser("/"); return <FundLink />; }
