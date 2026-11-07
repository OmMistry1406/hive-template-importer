import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { currentUser } from "@/lib/auth/server";
import { logout } from "./login/actions";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Template Importer",
  description: "Bring a Spectora template across intact, then keep working on it.",
};

function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <path d="M7 8h10M7 12h7M7 16h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="m14 16 2 2 3-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface">
          <div className="mx-auto flex h-13 max-w-[1400px] items-center gap-6 px-6">
            <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
              <Mark /> Template Importer
            </Link>
            {user && (
              <>
                <nav className="flex items-center gap-4 text-sm text-muted">
                  <Link href="/templates" className="hover:text-foreground">Templates</Link>
                  <Link href="/import" className="hover:text-foreground">Import</Link>
                </nav>
                <form action={logout} className="ml-auto flex items-center gap-3 text-sm text-muted">
                  <span>Signed in as {user}</span>
                  <button type="submit" className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-background hover:text-foreground">
                    <LogOut className="size-3.5" /> Sign out
                  </button>
                </form>
              </>
            )}
            {!user && (
              <Link href="/login" className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Sign in
              </Link>
            )}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
