import type { Metadata } from "next";
import "./globals.css";
import "./analytics.css";
import "./packages.css";
import "./operations.css";
import "./tickets.css";

export const metadata: Metadata = { title: "NetDesk ISP", description: "ISP customer care and ticket management" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
