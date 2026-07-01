import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "@/components/SignOutButton";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { name?: string; email?: string; role?: string };
  const role = user.role ?? "";
  const isAdminRole = role === "admin" || role === "finance";

  return (
    <div className="min-h-screen flex flex-col bg-ev-beige2">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-ev-gray7 bg-white">
        <div className="mx-auto max-w-screen-2xl px-6 flex items-center h-14 gap-8">
          <Link href="/dashboard" className="shrink-0">
            <Image
              src="/images/ev-logo-black.svg"
              alt="Engel & Völkers"
              width={166}
              height={40}
              priority
              className="h-8 w-auto"
            />
          </Link>

          <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto">
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/eerr">EERR YTD</NavLink>
            <NavLink href="/eerr/monthly">Mensual</NavLink>
            <NavLink href="/eerr/lmonth">Mes + YTD</NavLink>
            {isAdminRole && <>
              <span className="mx-2 w-px h-4 bg-ev-gray7 self-center" />
              <NavLink href="/admin/upload">Cargar</NavLink>
              <NavLink href="/admin/mappings">Mappings</NavLink>
              <NavLink href="/admin/files">Archivos</NavLink>
            </>}
          </nav>

          <div className="flex items-center gap-3 ml-auto shrink-0">
            <span className="text-xs text-ev-gray3 hidden sm:block font-body">
              {user.name ?? user.email}
              <span className="ml-2 px-1.5 py-0.5 border border-ev-gray6 text-ev-gray4 text-[10px] uppercase tracking-widest">
                {role}
              </span>
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
      className="px-3 py-1 text-xs uppercase tracking-[0.1em] text-ev-gray3
                 hover:text-ev-black transition-colors
                 border-b-2 border-transparent hover:border-ev-red"
    >
      {children}
    </Link>
  );
}
