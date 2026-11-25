"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type NavLinkProps = ComponentProps<typeof Link> & {
  href: string;
  /** Only match the exact path. By default nested routes also count as active. */
  exact?: boolean;
  /** Treat any path under this prefix as active (e.g. "/settings" for a group). */
  matchPrefix?: string;
  activeClassName?: string;
};

/** Link that marks itself with aria-current="page" when its route is active. */
export function NavLink({
  href,
  exact = false,
  matchPrefix,
  className,
  activeClassName,
  ...props
}: NavLinkProps) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    (!exact && pathname.startsWith(`${href}/`)) ||
    (matchPrefix !== undefined &&
      (pathname === matchPrefix || pathname.startsWith(`${matchPrefix}/`)));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(className, active && activeClassName)}
      {...props}
    />
  );
}
