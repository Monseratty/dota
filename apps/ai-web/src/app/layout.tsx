import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dota Replay AI Lab",
  description: "Premium AI-first workspace for Dota replay analytics."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
