import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { name?: string; email?: string; role?: string };
  const role = user.role ?? "";
  const isAdminRole = role === "admin" || role === "finance";

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-screen-2xl px-4 flex items-center h-12 gap-6">
          <span className="font-semibold text-neutral-900 text-sm whitespace-nowrap">Finanzas E&amp;V</span>

          <nav className="flex items-center gap-1 flex-1 overflow-x-auto text-sm">
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/eerr">EERR YTD</NavLink>
            <NavLink href="/eerr/monthly">Mensual</NavLink>
            <NavLink href="/eerr/lmonth">Mes + YTD</NavLink>
            {isAdminRole && <>
              <span className="mx-1 text-neutral-300">|</span>
              <NavLink href="/admin/upload">Cargar</NavLink>
              <NavLink href="/admin/mappings">Mappings</NavLink>
              <NavLink href="/admin/files">Archivos</NavLink>
            </>}
          </nav>

          <div className="flex items-center gap-3 ml-auto shrink-0">
            <span className="text-xs text-neutral-500 hidden sm:block">
              {user.name ?? user.email}
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400 text-[10px] uppercase">{role}</span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-screen-2xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
    >
      {children}
    </Link>
  );
}
