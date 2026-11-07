import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Template Importer",
  description: "Bring a Spectora template across intact, then keep working on it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface">
          <div className="mx-auto flex h-13 max-w-[1400px] items-center gap-6 px-6">
            <Link href="/" className="font-semibold tracking-tight">Template Importer</Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/templates" className="hover:text-foreground">Templates</Link>
              <Link href="/import" className="hover:text-foreground">Import</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
