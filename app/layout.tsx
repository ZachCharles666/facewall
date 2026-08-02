import type { Metadata, Viewport } from "next";
import { ClientErrorMonitor } from "@/components/observability/ClientErrorMonitor";
import "./globals.css";

export const metadata: Metadata = {
  title: "面试嘴替教练",
  description: "Hackathon MVP Alpha-Demo"
};

// viewportFit: "cover" is what makes env(safe-area-inset-*) resolve to a real
// value. Without it the insets are always 0 and bottom-anchored controls end up
// underneath the iOS Safari toolbar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>
        <ClientErrorMonitor />
        {children}
      </body>
    </html>
  );
}
