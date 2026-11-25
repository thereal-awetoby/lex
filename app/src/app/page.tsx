"use client";

import { useState } from "react";
import { ConnectWallet } from "@/components/ConnectWallet";
import { CreateMandate } from "@/components/CreateMandate";
import { MandateView } from "@/components/MandateView";

export default function Home() {
  const [view, setView] = useState<"create" | "manage">("create");

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Lex</h1>
        <ConnectWallet />
      </div>

      <nav className="flex gap-1 mb-6 border-b">
        <button
          onClick={() => setView("create")}
          className={`px-4 py-2 text-sm ${
            view === "create" ? "border-b-2 border-black font-medium" : "text-gray-500"
          }`}
        >
          Create
        </button>
        <button
          onClick={() => setView("manage")}
          className={`px-4 py-2 text-sm ${
            view === "manage" ? "border-b-2 border-black font-medium" : "text-gray-500"
          }`}
        >
          Manage
        </button>
      </nav>

      {view === "create" && <CreateMandate />}
      {view === "manage" && <MandateView />}
    </main>
  );
}
