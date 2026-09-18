// ---------------------------------------------------------------------------
// Provider factory — the ONLY place that decides which FlightSearchProvider
// implementation is active. To connect a real API:
//
//   1. Implement `FlightSearchProvider` in a new file, e.g.
//      `AmadeusFlightProvider.ts`.
//   2. Import it below and add it to `PROVIDERS`.
//   3. Set FLIGHT_API_PROVIDER=amadeus and the corresponding credentials in
//      your environment (see .env.example).
//
// Nothing else in the codebase needs to change — every screen and API route
// talks to `getActiveProvider()`, never to a concrete implementation.
// ---------------------------------------------------------------------------

import { FlightSearchProvider } from "./FlightSearchProvider";
import { mockFlightProvider } from "./MockFlightProvider";
import { ProviderConfig, ProviderId } from "@/lib/types";

const PROVIDERS: Partial<Record<ProviderId, FlightSearchProvider>> = {
  mock: mockFlightProvider,
  // amadeus: amadeusFlightProvider,  // <-- uncomment once implemented
};

function envProvider(): ProviderId {
  const raw = process.env.FLIGHT_API_PROVIDER as ProviderId | undefined;
  if (raw && PROVIDERS[raw]) return raw;
  return "mock";
}

export function getActiveProvider(): FlightSearchProvider {
  const provider = PROVIDERS[envProvider()];
  return provider ?? mockFlightProvider;
}

export function getProviderConfig(): ProviderConfig {
  const active = envProvider();
  return {
    activeProvider: active,
    available: [
      { id: "mock", label: "Mock Flight Provider (demo)", configured: true },
      {
        id: "amadeus",
        label: "Amadeus Self-Service API",
        configured: Boolean(process.env.FLIGHT_API_KEY && process.env.FLIGHT_API_SECRET),
      },
      {
        id: "custom",
        label: "Proveedor personalizado",
        configured: Boolean(process.env.FLIGHT_API_KEY),
      },
    ],
  };
}

export * from "./FlightSearchProvider";
