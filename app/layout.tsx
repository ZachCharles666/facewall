import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "面试嘴替教练",
  description: "Hackathon MVP Alpha-Demo"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
