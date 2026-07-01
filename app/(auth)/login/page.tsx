"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Image from "next/image";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Email o contraseña incorrectos.");
    } else {
      router.push(callbackUrl);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ev-beige2">
      <div className="w-full max-w-xs">
        <div className="mb-10 flex flex-col items-center gap-5">
          <Image
            src="/images/ev-logo-black.svg"
            alt="Engel & Völkers"
            width={180}
            height={44}
            priority
            className="w-[180px] h-auto"
          />
          <span className="block w-8 h-px bg-ev-red" />
          <p className="text-[10px] uppercase tracking-[0.1em] text-ev-gray3 font-body">
            Portal Financiero
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-ev-gray7 p-8 space-y-5">
          <div>
            <label className="block text-[10px] font-body uppercase tracking-[0.08em] text-ev-gray2 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-ev-gray6 px-3 py-2.5 text-sm font-body
                         focus:outline-none focus:ring-1 focus:ring-ev-black text-ev-black"
              placeholder="usuario@engelvoelkers.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-body uppercase tracking-[0.08em] text-ev-gray2 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-ev-gray6 px-3 py-2.5 text-sm font-body
                         focus:outline-none focus:ring-1 focus:ring-ev-black text-ev-black"
            />
          </div>

          {error && (
            <p className="text-sm text-ev-red text-center font-body">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-ev-black text-white text-xs font-body
                       uppercase tracking-[0.1em] hover:bg-ev-gray1
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
