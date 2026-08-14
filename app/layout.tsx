import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "NetDesk ISP", description: "ISP customer care and ticket management" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
