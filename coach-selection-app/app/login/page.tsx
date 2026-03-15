"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl md:grid-cols-2">
          <div className="flex flex-col justify-center bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 p-8 md:p-12">
            <div className="inline-flex w-fit rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-emerald-100">
              Coaches Portal
            </div>

            <h1 className="mt-6 text-3xl font-bold sm:text-4xl">
              Login to submit your weekly team
            </h1>

            <p className="mt-4 max-w-md text-sm leading-6 text-emerald-50/85 sm:text-base">
              Coaches will log in here, select their team for the round, order
              emergencies by position, and submit before the weekly deadline.
            </p>
          </div>

          <div className="flex items-center justify-center p-8 md:p-12">
            <div className="w-full max-w-md">
              <h2 className="text-2xl font-semibold">Coach Login</h2>
              <p className="mt-2 text-sm text-slate-400">
                This is the first draft of the login page UI.
              </p>

              <form className="mt-8 space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="coach@email.com"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-200">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400"
                  />
                </div>

                <button
                  type="button"
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Login
                </button>
              </form>

              <div className="mt-6 flex items-center justify-between text-sm text-slate-400">
                <Link href="/" className="hover:text-white">
                  Back to Home
                </Link>

                <Link href="/select-team" className="hover:text-white">
                  Preview Selection Page
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}