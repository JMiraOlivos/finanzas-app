import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as { role?: string })?.role;
  if (role !== "admin" && role !== "finance") redirect("/dashboard");

  const user = session.user as { name?: string; email?: string };

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      <header className="sticky top-0 z-30 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-screen-2xl px-4 flex items-center h-12 gap-6">
          <span className="font-semibold text-neutral-900 text-sm">Finanzas E&amp;V</span>
          <nav className="flex items-center gap-1 flex-1 text-sm">
            <Link href="/dashboard" className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Dashboard</Link>
            <Link href="/eerr"      className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">EERR</Link>
            <span className="mx-1 text-neutral-300">|</span>
            <Link href="/admin/upload"   className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Cargar</Link>
            <Link href="/admin/budget"   className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Presupuesto</Link>
            <Link href="/admin/forecast" className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Forecast</Link>
            <Link href="/admin/mappings" className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Mappings</Link>
            <Link href="/admin/files"    className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Archivos</Link>
            <Link href="/admin/control"  className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Control</Link>
            <Link href="/admin/users"    className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Usuarios</Link>
            <Link href="/admin/audit"    className="px-2.5 py-1 rounded text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100">Auditoría</Link>
          </nav>
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs text-neutral-500 hidden sm:block">{user.name ?? user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-screen-2xl px-4 py-6">{children}</main>
    </div>
  );
}
