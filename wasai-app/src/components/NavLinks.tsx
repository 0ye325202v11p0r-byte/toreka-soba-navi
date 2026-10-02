"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Client component only for usePathname: the header highlights the section
// you're in (feedback from trying the site — nothing showed where you were).
// "/requests/new" counts as 依頼掲示板, "/craftsmen/<id>" as 和裁士を探す.
export function NavLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 whitespace-nowrap border-b-2 py-1 transition-colors ${
        active ? "border-accent font-semibold text-accent-strong" : "border-transparent text-ink-muted hover:text-ink"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
