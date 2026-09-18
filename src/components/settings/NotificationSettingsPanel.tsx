"use client";

import { useEffect, useState } from "react";
import { FlightSearch, NotificationChannel, NotificationSetting } from "@/lib/types";

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: "telegram", label: "Telegram" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
];

function defaultsFor(searchId: string, channel: NotificationChannel): Omit<NotificationSetting, "id"> {
  return { searchId, channel, enabled: false, minimumPrice: null, minimumDropPercent: 10, exceptionalOnly: false };
}

export function NotificationSettingsPanel({ searches }: { searches: FlightSearch[] }) {
  const [searchId, setSearchId] = useState(searches[0]?.id ?? "");
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!searchId) return;
    setLoading(true);
    fetch(`/api/notification-settings?searchId=${searchId}`)
      .then((r) => r.json())
      .then((data: NotificationSetting[]) => setSettings(data))
      .finally(() => setLoading(false));
  }, [searchId]);

  function getSetting(channel: NotificationChannel): Omit<NotificationSetting, "id"> & { id?: string } {
    return settings.find((s) => s.channel === channel) ?? defaultsFor(searchId, channel);
  }

  function updateLocal(channel: NotificationChannel, patch: Partial<NotificationSetting>) {
    setSettings((cur) => {
      const existing = cur.find((s) => s.channel === channel);
      if (existing) return cur.map((s) => (s.channel === channel ? { ...s, ...patch } : s));
      return [...cur, { ...defaultsFor(searchId, channel), id: "", ...patch }];
    });
  }

  async function save(channel: NotificationChannel) {
    const setting = getSetting(channel);
    const res = await fetch("/api/notification-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setting),
    });
    const saved = await res.json();
    setSettings((cur) => {
      const others = cur.filter((s) => s.channel !== channel);
      return [...others, saved];
    });
    setSavedAt(Date.now());
  }

  if (searches.length === 0) {
    return <div className="text-sm text-base-500">Creá una búsqueda primero para configurar sus alertas.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="label">Búsqueda</label>
        <select className="input max-w-sm" value={searchId} onChange={(e) => setSearchId(e.target.value)}>
          {searches.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-base-500">Cargando…</div>
      ) : (
        <div className="flex flex-col gap-3">
          {CHANNELS.map(({ key, label }) => {
            const s = getSetting(key);
            return (
              <div key={key} className="card card-pad">
                <div className="mb-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium text-base-100">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) => updateLocal(key, { enabled: e.target.checked })}
                    />
                    {label}
                  </label>
                  <button onClick={() => save(key)} className="btn-secondary text-xs">
                    Guardar
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="label">Avisar debajo de</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="Sin límite"
                      value={s.minimumPrice ?? ""}
                      onChange={(e) => updateLocal(key, { minimumPrice: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="label">Avisar si baja más de (%)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="Sin límite"
                      value={s.minimumDropPercent ?? ""}
                      onChange={(e) => updateLocal(key, { minimumDropPercent: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </div>
                  <label className="mt-6 flex items-center gap-2 text-xs text-base-300">
                    <input
                      type="checkbox"
                      checked={s.exceptionalOnly}
                      onChange={(e) => updateLocal(key, { exceptionalOnly: e.target.checked })}
                    />
                    Solo precio excepcional
                  </label>
                </div>
              </div>
            );
          })}
          {savedAt && <div className="text-xs text-emerald-400">Configuración guardada.</div>}
        </div>
      )}
    </div>
  );
}
