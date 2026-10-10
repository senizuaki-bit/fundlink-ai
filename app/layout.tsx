import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
export const metadata: Metadata = { title: "FundLink AI · 连接创新与资本", description: "从机会发现、证据研究到双向匹配，属于你的投融资智能工作台。", icons: { icon: "/favicon.svg" } };
export default function RootLayout({children}:{children:React.ReactNode}){ return <html lang="zh-CN"><body>{children}</body></html> }
