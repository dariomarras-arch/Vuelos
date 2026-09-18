"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunNowButton({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function handleClick() {
    setRunning(true);
    try {
      const res = await fetch(`/api/searches/${searchId}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Falló la ejecución");
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={running} className="btn-primary">
      {running ? "Buscando…" : "Ejecutar búsqueda ahora"}
    </button>
  );
}
