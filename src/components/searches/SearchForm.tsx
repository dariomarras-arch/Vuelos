"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BaggageOption,
  CACHE_TTL_OPTIONS,
  CacheTtlHours,
  CurrencyCode,
  FLEXIBILITY_OPTIONS,
  FlexibilityDays,
  FlightSearch,
  MAX_STOPS_OPTIONS,
  NewFlightSearch,
  ScheduleMode,
  TIME_SLOTS,
  TimeSlotKey,
  TripType,
} from "@/lib/types";

function parseAges(input: string): number[] {
  return input
    .split(/[\s,]+/)
    .map((a) => Number(a.trim()))
    .filter((a) => Number.isFinite(a) && a >= 0 && a < 18);
}

const BAGGAGE_LABELS: Record<BaggageOption, string> = {
  none: "Sin equipaje",
  carry_on: "Equipaje de mano",
  checked_1: "1 valija despachada",
  checked_multiple: "Varias valijas",
};

function parseCodes(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

type FormState = {
  name: string;
  origins: string;
  destinations: string;
  allowNearbyAirports: boolean;
  tripType: TripType;
  dateFrom: string;
  dateTo: string;
  minNights: number;
  maxNights: number;
  flexibilityDays: FlexibilityDays;
  adults: number;
  childrenAges: string;
  baggageRequirement: BaggageOption;
  maxStops: 0 | 1 | 2;
  targetPrice: number;
  maxPrice: number;
  currency: CurrencyCode;
  scheduleMode: ScheduleMode;
  departurePreferredSlots: TimeSlotKey[];
  returnPreferredSlots: TimeSlotKey[];
  maxRequestsPerRun: number;
  maxRequestsPerDay: number;
  cacheTtlHours: CacheTtlHours;
};

function initialState(existing?: FlightSearch): FormState {
  if (existing) {
    return {
      name: existing.name,
      origins: existing.origins.join(", "),
      destinations: existing.destinations.join(", "),
      allowNearbyAirports: existing.allowNearbyAirports,
      tripType: existing.tripType,
      dateFrom: existing.dateFrom,
      dateTo: existing.dateTo,
      minNights: existing.minNights,
      maxNights: existing.maxNights,
      flexibilityDays: existing.flexibilityDays,
      adults: existing.passengers.adults,
      childrenAges: existing.passengers.childrenAges.join(", "),
      baggageRequirement: existing.baggageRequirement,
      maxStops: existing.maxStops,
      targetPrice: existing.targetPrice,
      maxPrice: existing.maxPrice,
      currency: existing.currency,
      scheduleMode: existing.schedule.mode,
      departurePreferredSlots: existing.schedule.departurePreferredSlots ?? [],
      returnPreferredSlots: existing.schedule.returnPreferredSlots ?? [],
      maxRequestsPerRun: existing.requestBudget.maxRequestsPerRun,
      maxRequestsPerDay: existing.requestBudget.maxRequestsPerDay,
      cacheTtlHours: existing.cacheTtlHours,
    };
  }
  return {
    name: "",
    origins: "EZE",
    destinations: "",
    allowNearbyAirports: true,
    tripType: "round_trip",
    dateFrom: "",
    dateTo: "",
    minNights: 7,
    maxNights: 14,
    flexibilityDays: 3,
    adults: 1,
    childrenAges: "",
    baggageRequirement: "checked_1",
    maxStops: 1,
    targetPrice: 700,
    maxPrice: 850,
    currency: "USD",
    scheduleMode: "any",
    departurePreferredSlots: [],
    returnPreferredSlots: [],
    maxRequestsPerRun: 100,
    maxRequestsPerDay: 300,
    cacheTtlHours: 12,
  };
}

function toPayload(form: FormState): NewFlightSearch {
  return {
    name: form.name || `${parseCodes(form.origins)[0] ?? "?"} → ${parseCodes(form.destinations)[0] ?? "?"}`,
    origins: parseCodes(form.origins),
    destinations: parseCodes(form.destinations),
    allowNearbyAirports: form.allowNearbyAirports,
    tripType: form.tripType,
    dateFrom: form.dateFrom,
    dateTo: form.dateTo,
    minNights: Number(form.minNights),
    maxNights: Number(form.maxNights),
    flexibilityDays: form.flexibilityDays,
    passengers: { adults: Number(form.adults), childrenAges: parseAges(form.childrenAges) },
    baggageRequirement: form.baggageRequirement,
    maxStops: form.maxStops,
    targetPrice: Number(form.targetPrice),
    maxPrice: Number(form.maxPrice),
    currency: form.currency,
    schedule: {
      mode: form.scheduleMode,
      departurePreferredSlots: form.scheduleMode !== "any" ? form.departurePreferredSlots : undefined,
      returnPreferredSlots: form.scheduleMode !== "any" ? form.returnPreferredSlots : undefined,
    },
    requestBudget: { maxRequestsPerRun: Number(form.maxRequestsPerRun), maxRequestsPerDay: Number(form.maxRequestsPerDay) },
    cacheTtlHours: form.cacheTtlHours,
  };
}

function toggleSlot(list: TimeSlotKey[], slot: TimeSlotKey): TimeSlotKey[] {
  return list.includes(slot) ? list.filter((s) => s !== slot) : [...list, slot];
}

export function SearchForm({ existing }: { existing?: FlightSearch }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(existing));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = toPayload(form);
      if (!payload.origins.length || !payload.destinations.length) {
        throw new Error("Ingresá al menos un aeropuerto de origen y uno de destino.");
      }
      if (!payload.dateFrom || !payload.dateTo) {
        throw new Error("Definí el rango de fechas.");
      }

      const res = await fetch(existing ? `/api/searches/${existing.id}` : "/api/searches", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo guardar la búsqueda.");
      }
      const saved = await res.json();
      router.push(`/searches/${saved.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="card card-pad">
        <label className="label">Nombre de la búsqueda</label>
        <input
          className="input"
          placeholder='Ej: "Miami / Orlando Noviembre"'
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="card card-pad grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Origen (códigos IATA, separados por coma)</label>
          <input className="input" placeholder="EZE" value={form.origins} onChange={(e) => set("origins", e.target.value)} />
        </div>
        <div>
          <label className="label">Destinos (múltiples, separados por coma)</label>
          <input
            className="input"
            placeholder="MIA, FLL, MCO"
            value={form.destinations}
            onChange={(e) => set("destinations", e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-base-300 sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-white/20 bg-base-850"
            checked={form.allowNearbyAirports}
            onChange={(e) => set("allowNearbyAirports", e.target.checked)}
          />
          Permitir aeropuertos alternativos cercanos (ej. MIA ↔ FLL, EZE ↔ AEP)
        </label>
      </div>

      <div className="card card-pad grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Tipo de viaje</label>
          <select className="input" value={form.tripType} onChange={(e) => set("tripType", e.target.value as TripType)}>
            <option value="round_trip">Ida y vuelta</option>
            <option value="one_way">Solo ida</option>
          </select>
        </div>
        <div>
          <label className="label">Fecha desde</label>
          <input type="date" className="input" value={form.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />
        </div>
        <div>
          <label className="label">Fecha hasta</label>
          <input type="date" className="input" value={form.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
        </div>
        <div>
          <label className="label">Flexibilidad</label>
          <select
            className="input"
            value={form.flexibilityDays}
            onChange={(e) => set("flexibilityDays", Number(e.target.value) as FlexibilityDays)}
          >
            {FLEXIBILITY_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f === 0 ? "0 días" : `±${f} días`}
              </option>
            ))}
          </select>
        </div>
        {form.tripType === "round_trip" && (
          <>
            <div>
              <label className="label">Duración mínima (noches)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={form.minNights}
                onChange={(e) => set("minNights", Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Duración máxima (noches)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={form.maxNights}
                onChange={(e) => set("maxNights", Number(e.target.value))}
              />
            </div>
          </>
        )}
      </div>

      <div className="card card-pad grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Adultos</label>
          <input
            type="number"
            min={1}
            className="input"
            value={form.adults}
            onChange={(e) => set("adults", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Niños (edad de cada uno)</label>
          <input
            className="input"
            placeholder="10, 6, 4"
            value={form.childrenAges}
            onChange={(e) => set("childrenAges", e.target.value)}
          />
          <p className="mt-1 text-[11px] text-base-500">
            La edad se usa para estimar tarifa infantil cuando el proveedor la informa por separado.
          </p>
        </div>
        <div>
          <label className="label">Equipaje</label>
          <select
            className="input"
            value={form.baggageRequirement}
            onChange={(e) => set("baggageRequirement", e.target.value as BaggageOption)}
          >
            {Object.entries(BAGGAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Escalas máximas</label>
          <select className="input" value={form.maxStops} onChange={(e) => set("maxStops", Number(e.target.value) as 0 | 1 | 2)}>
            {MAX_STOPS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card card-pad grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Precio objetivo (por adulto)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={form.targetPrice}
            onChange={(e) => set("targetPrice", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Precio máximo (por adulto)</label>
          <input
            type="number"
            min={0}
            className="input"
            value={form.maxPrice}
            onChange={(e) => set("maxPrice", Number(e.target.value))}
          />
          <p className="mt-1 text-[11px] text-base-500">
            Se compara contra la tarifa de referencia por adulto — el total para todos los pasajeros se muestra aparte.
          </p>
        </div>
        <div>
          <label className="label">Moneda</label>
          <select className="input" value={form.currency} onChange={(e) => set("currency", e.target.value as CurrencyCode)}>
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </div>
      </div>

      <div className="card card-pad">
        <label className="label">Horarios</label>
        <div className="mb-3 flex flex-wrap gap-4 text-sm text-base-300">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scheduleMode"
              checked={form.scheduleMode === "any"}
              onChange={() => set("scheduleMode", "any")}
            />
            Cualquier horario
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scheduleMode"
              checked={form.scheduleMode === "preferred"}
              onChange={() => set("scheduleMode", "preferred")}
            />
            Preferencia (prioriza estas franjas, no descarta el resto)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="scheduleMode"
              checked={form.scheduleMode === "strict"}
              onChange={() => set("scheduleMode", "strict")}
            />
            Restricción (solo acepta estas franjas)
          </label>
        </div>
        {form.scheduleMode !== "any" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs text-base-400">Franjas preferidas de ida</div>
              <div className="flex flex-wrap gap-1.5">
                {TIME_SLOTS.map((slot) => (
                  <button
                    type="button"
                    key={slot}
                    onClick={() => set("departurePreferredSlots", toggleSlot(form.departurePreferredSlots, slot))}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      form.departurePreferredSlots.includes(slot)
                        ? "bg-accent-500 text-base-950"
                        : "bg-base-850 text-base-300 border border-white/10"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs text-base-400">Franjas preferidas de vuelta</div>
              <div className="flex flex-wrap gap-1.5">
                {TIME_SLOTS.map((slot) => (
                  <button
                    type="button"
                    key={slot}
                    onClick={() => set("returnPreferredSlots", toggleSlot(form.returnPreferredSlots, slot))}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      form.returnPreferredSlots.includes(slot)
                        ? "bg-accent-500 text-base-950"
                        : "bg-base-850 text-base-300 border border-white/10"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card card-pad grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Máximo de requests por corrida</label>
          <input
            type="number"
            min={1}
            className="input"
            value={form.maxRequestsPerRun}
            onChange={(e) => set("maxRequestsPerRun", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Máximo de requests por día</label>
          <input
            type="number"
            min={1}
            className="input"
            value={form.maxRequestsPerDay}
            onChange={(e) => set("maxRequestsPerDay", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Vigencia del cache (TTL)</label>
          <select
            className="input"
            value={form.cacheTtlHours}
            onChange={(e) => set("cacheTtlHours", Number(e.target.value) as CacheTtlHours)}
          >
            {CACHE_TTL_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h} horas
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-base-500 sm:col-span-3">
          El motor nunca supera estos límites. Una búsqueda ya consultada dentro del TTL se reutiliza desde cache en vez de
          generar un request nuevo.
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>}

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Guardando…" : existing ? "Guardar cambios" : "Crear búsqueda"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
