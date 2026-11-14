import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2UI playground",
  description: "Single-user playground for agent-generated A2UI interfaces with CopilotKit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
