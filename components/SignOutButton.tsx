"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-xs text-neutral-400 hover:text-neutral-700"
    >
      Salir
    </button>
  );
}
