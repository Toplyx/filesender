import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FileSender — Send a file. One code is enough.",
  description: "Share files up to 150 GB using a simple code. Upload a file, send the code, and download it on another device.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
