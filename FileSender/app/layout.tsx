import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FileSender — Pošli soubor. Stačí kód.",
  description: "Sdílej soubory až do 100 MB pomocí jednoduchého kódu. Nahraj soubor, předej kód a stáhni ho na druhém zařízení.",
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
    <html lang="cs">
      <body className="antialiased">{children}</body>
    </html>
  );
}
