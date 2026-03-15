"use client";

import Link from "next/link";
import { useState } from "react";

const playerOptions = [
  "Select player",
  "Nick Daicos",
  "Marcus Bontempelli",
  "Max Gawn",
  "Errol Gulden",
  "Jordan Dawson",
  "Zak Butters",
  "Tom Green",
  "Caleb Serong",
  "Rowan Marshall",
  "Jack Sinclair",
];

type PlayerSelectProps = {
  label: string;
};

function PlayerSelect({ label }: PlayerSelectProps) {
  const [value, setValue] = useState("Select player");

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-white">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-xl border border-white/20 bg-black/35 px-4 py-3 text-white outline-none transition focus:border-emerald-300"
      >
        {playerOptions.map((player) => (
          <option key={player} value={player} className="text-black">
            {player}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SelectTeamPage() {
  return (
    <main
      className="min-h-screen bg-slate-950 text-white"
      style={{
        backgroundImage:
          "linear-gradient(rgba(2,6,23,0.78), rgba(2,6,23,0.88)), url('https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&w=1600&q=80')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
              Weekly Team Selection
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Select Team — Round 1
            </h1>
            <p className="mt-3 text-sm text-slate-200 sm:text-base">
              Deadline: Thursday 7:00 PM
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/"
              className="rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Home
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Login
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/15 bg-black/35 p-6 backdrop-blur-sm">
            <h2 className="mb-5 text-xl font-bold">On Field</h2>

            <div className="grid gap-5 md:grid-cols-2">
              <PlayerSelect label="DEF 1" />
              <PlayerSelect label="DEF 2" />
              <PlayerSelect label="MID 1" />
              <PlayerSelect label="MID 2" />
              <PlayerSelect label="RUC 1" />
              <PlayerSelect label="FOR 1" />
            </div>
          </section>

          <section className="rounded-3xl border border-white/15 bg-black/35 p-6 backdrop-blur-sm">
            <h2 className="mb-5 text-xl font-bold">Emergencies</h2>

            <div className="grid gap-5 md:grid-cols-2">
              <PlayerSelect label="DEF Emergency 1" />
              <PlayerSelect label="DEF Emergency 2" />
              <PlayerSelect label="MID Emergency 1" />
              <PlayerSelect label="MID Emergency 2" />
              <PlayerSelect label="RUC Emergency 1" />
              <PlayerSelect label="FOR Emergency 1" />
            </div>
          </section>
        </div>

        <div className="mt-8 rounded-3xl border border-white/15 bg-black/35 p-6 backdrop-blur-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold">Submit Team</h3>
              <p className="mt-1 text-sm text-slate-200">
                This button will later save the team to the database.
              </p>
            </div>

            <button
              type="button"
              className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Submit Team
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}