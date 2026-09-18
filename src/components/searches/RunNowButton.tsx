"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunNowButton({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  async function handleClick() {
    setRunning(true);
    try {
      const res = await fetch(`/api/searches/${searchId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });
      if (!res.ok) throw new Error("Falló la ejecución");
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-base-400">
        <input type="checkbox" checked={forceRefresh} onChange={(e) => setForceRefresh(e.target.checked)} />
        Forzar actualización (ignorar cache)
      </label>
      <button onClick={handleClick} disabled={running} className="btn-primary">
        {running ? "Buscando…" : "Ejecutar búsqueda ahora"}
      </button>
    </div>
  );
}
