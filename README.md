# ✈️ Flight Hunter

Agente de monitoreo automático de precios de vuelos: analiza fechas, duraciones,
horarios y aeropuertos alternativos, y detecta **oportunidades de precio**
comparando cada resultado contra el histórico observado y contra los
parámetros que vos configuraste — nunca contra un único "vuelo más barato".

> ⚠️ **MODO DEMO — DATOS SIMULADOS.** Sin configurar Supabase ni una API de
> vuelos real, la app corre igual, de punta a punta, con datos generados por
> `MockFlightProvider`. Todo el precio, histórico y alertas que ves son
> sintéticos. El banner amarillo en la UI lo indica en todo momento.

---

## 1. Qué hace

- Configurás una búsqueda: origen(es), destino(s), rango de fechas, duración
  del viaje, flexibilidad, pasajeros, equipaje, escalas máximas, precio
  objetivo/máximo, horarios preferidos y aeropuertos alternativos.
- El motor (`src/lib/engine/runSearch.ts`) expande eso en un conjunto acotado
  de combinaciones concretas (rutas × fechas × duraciones) y consulta al
  proveedor de vuelos activo para cada una — cada consulta ya devuelve varios
  horarios/aerolíneas/escalas, así que el sistema nunca asume que una franja
  horaria es "siempre más barata": lo mide.
- Cada resultado se persiste en `flight_price_history` (histórico permanente)
  y se evalúa contra el **Opportunity Score** (ver sección 6).
- Las oportunidades que cumplen reglas configurables generan **alertas**,
  deduplicadas para no repetir el mismo vuelo/precio.
- Todo queda visible en un dashboard, un calendario de precios, un analizador
  de horarios, un comparador de vuelos, un historial de alertas y un log de
  ejecuciones.

## 2. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Gráficos | Recharts |
| Backend/DB | Supabase (Postgres) — opcional, con fallback en memoria |
| Automatización | Endpoint `/api/cron` + Vercel Cron (o cualquier scheduler externo) |
| Proveedor de vuelos | Capa abstracta `FlightSearchProvider` + `MockFlightProvider` |
| Alertas | Capa abstracta lista para Telegram / WhatsApp / Email |
| Deploy | Vercel |

---

## 3. Arquitectura

```
src/
  app/                        # Next.js App Router
    page.tsx                  # Dashboard global
    searches/                 # Listado, alta, edición y detalle de búsquedas
      [id]/
        page.tsx              # Vista "monitor" de una búsqueda
        calendar/page.tsx     # Calendario de precios
        schedule/page.tsx     # Análisis de horarios
        compare/page.tsx      # Comparador de vuelos
    alerts/page.tsx           # Historial de alertas
    logs/page.tsx             # Historial de ejecuciones
    settings/page.tsx         # Proveedor, scheduler, notificaciones
    api/
      searches/                       # CRUD de búsquedas
      searches/[id]/run/route.ts      # Disparo manual del motor
      cron/route.ts                   # Disparo automático (Vercel Cron)
      notification-settings/route.ts  # Config de alertas por canal
      export/{history,results,alerts}/route.ts  # Exportación CSV

  lib/
    types.ts                  # Modelo de dominio único (fuente de verdad)
    providers/                # === Capa de datos de vuelos ===
      FlightSearchProvider.ts # Interfaz abstracta (el contrato)
      MockFlightProvider.ts   # Implementación simulada (activa por defecto)
      mockData.ts             # Aeropuertos, aerolíneas, generador determinístico
      index.ts                # Factory: elige el proveedor activo por env var
    data/                      # === Capa de persistencia ===
      repository.ts            # Interfaz abstracta
      inMemoryRepository.ts    # Demo, sin configuración
      supabaseRepository.ts    # Postgres real vía supabase-js
      ready.ts                 # Wrapper que siembra datos demo la 1ª vez
    engine/
      combinations.ts          # Muestreo de fechas/duraciones/rutas
      runSearch.ts             # Orquestador: motor de búsqueda completo
    analytics/
      stats.ts                 # Promedio, mediana, percentiles, etc.
      opportunity.ts            # Reglas A–H + clasificación del Opportunity Score
      timeSlots.ts              # Agregación por franja horaria
      calendar.ts                # Mejores fechas + "date shift" calculado
    alerts/
      engine.ts                 # Qué dispara una alerta + deduplicación
      dedup.ts                  # Clave de deduplicación
      message.ts                # Plantilla del mensaje de alerta
    ai/explain.ts                # Capa de explicación (reemplazable por un LLM real)
    scheduler/frequency.ts       # Frecuencia de corridas según cercanía de la fecha
    seed/seed.ts                 # Datos de ejemplo (solo en modo demo)

supabase/schema.sql            # Esquema completo, con RLS
```

### El seam más importante: `FlightSearchProvider`

```ts
interface FlightSearchProvider {
  searchFlights(query): Promise<FlightResult[]>;
  getFlightDetails(id): Promise<FlightResult | null>;
  getPriceCalendar(query): Promise<CalendarDayPrice[]>;
  getPriceHistory(query): Promise<FlightPriceHistoryEntry[]>;
}
```

Ninguna pantalla ni ruta de API conoce a `MockFlightProvider` directamente:
todas llaman a `getActiveProvider()` (`src/lib/providers/index.ts`). Conectar
una API real es agregar un archivo nuevo + una línea en ese factory — ver
sección 7.

### El segundo seam: `Repository`

Mismo patrón para persistencia: `getRepository()` (o `getReadyRepository()`
desde páginas/rutas) devuelve `InMemoryRepository` o `SupabaseRepository`
según si `SUPABASE_URL` está configurado. La interfaz `Repository`
(`src/lib/data/repository.ts`) es idéntica para ambas.

---

## 4. Cómo funciona el motor de oportunidades

1. **Estrategia de búsqueda** (`engine/searchStrategy.ts` + `engine/priority.ts`
   + `engine/runSearch.ts`) — motor en dos niveles, pensado para no volear
   cientos de requests contra una API real (ver sección 4bis).
2. **Búsqueda**: cada combinación elegida se consulta al proveedor activo, que
   devuelve varios itinerarios con distintos horarios, aerolíneas y escalas.
   Todo se guarda en `flight_results` y `flight_price_history`.
3. **Estadísticas históricas** (`analytics/stats.ts`): por cada ruta se
   calculan promedio, mediana, mínimo, máximo, percentil 10/25 y promedios de
   7/30/90 días sobre el histórico acumulado.
4. **Opportunity Score** (`analytics/opportunity.ts`): cada vuelo se evalúa
   contra 8 reglas configurables (A–H, spec original) y se clasifica en
   `EXCEPCIONAL / MUY_INTERESANTE / INTERESANTE / NORMAL / ALTO`. Es
   **descriptivo, no prescriptivo**: nunca dice "comprá esto", dice "este
   precio está X% por debajo del histórico".
5. **Alertas** (`alerts/engine.ts`): las oportunidades que cumplen el umbral
   configurado por canal generan una alerta, con una clave de deduplicación
   (`alerts/dedup.ts`) que evita reenviar el mismo vuelo/precio.
6. **Log** (`search_runs`): cada corrida registra combinaciones analizadas,
   vuelos encontrados, oportunidades, alertas enviadas y telemetría de
   requests (ver sección 4bis).

La UI separa siempre tres cosas (ver spec original, sección 29): **DATOS**
(precio, escalas, equipaje) vs. **ANÁLISIS** (% vs. promedio/objetivo/mínimo)
vs. **ALERTA** (qué regla se cumplió) — nunca se mezclan como si fueran lo
mismo.

---

## 4bis. Motor de búsqueda eficiente (v2)

Rediseñado explícitamente para no depender de "una request por combinación"
cuando conectemos una API real con rate limit y costo por búsqueda.

### Dos niveles

```
Configuración
      ↓
Nivel 1 — Exploración        (engine/searchStrategy.ts)
      ↓                       1 request de calendario por ruta si el
      ↓                       proveedor lo soporta (provider.capabilities.
      ↓                       supportsPriceCalendar) — si no, cae a un
      ↓                       muestreo acotado de búsquedas exactas.
Detectar zonas baratas         (engine/priority.ts)
      ↓                       scoring determinístico (sin ML): cercanía al
      ↓                       mínimo histórico, al objetivo, franja horaria
      ↓                       históricamente barata, aeropuerto alternativo
      ↓                       con descuento conocido.
Nivel 2 — Profundización       (engine/runSearch.ts)
      ↓                       búsquedas exactas SOLO sobre los candidatos
      ↓                       de mayor prioridad, acotadas por el
      ↓                       presupuesto de requests restante.
Resultados detallados → Opportunity Engine → Alerta
```

### Presupuesto de requests

Cada búsqueda tiene `requestBudget: { maxRequestsPerRun, maxRequestsPerDay }`
(default 100/300, configurable en el formulario). El motor nunca los supera —
`SearchRun.budgetExhausted` queda en `true` cuando había más candidatos que
presupuesto disponible. Ver `/api-usage` para el consumo en vivo.

### Cache / deduplicación

Antes de cualquier request real, se calcula una clave determinística
(`engine/cache.ts`, `buildSearchCacheKey`):

```
EZE|MIA|2026-11-16|2026-11-26|2ADT|3CHD|USD
```

Si existe una entrada en `provider_cache` fresca (dentro del
`cacheTtlHours` configurado — 6/12/24h), se reutiliza y **no** cuenta contra
el presupuesto de requests. El botón "Ejecutar búsqueda ahora" tiene un
checkbox "Forzar actualización" que ignora el cache para esa corrida.

### Errores por combinación, retry y rate limit

`providers/errors.ts` define `ProviderError` con códigos
`RATE_LIMITED | TIMEOUT | INVALID_ROUTE | AUTHENTICATION | QUOTA_EXCEEDED |
PROVIDER_ERROR | UNKNOWN`. `providers/retryPolicy.ts` decide, por código, si
reintentar (con qué backoff) o abortar toda la corrida — solo
`AUTHENTICATION` (error de configuración) y `QUOTA_EXCEEDED` detienen la
corrida completa; el resto de los errores se registra y el motor sigue con
la siguiente combinación (`engine/runSearch.ts` ya no tiene un único
`try/catch` alrededor de todo el loop). `providers/rateLimiter.ts` es un
limitador genérico configurado desde `provider.rateLimit` — nunca asume un
límite fijo, lo declara el proveedor.

### Precio por pasajero (corrección del modelo v1)

v1 asumía `effectivePrice × cantidad_de_pasajeros`, como si todos pagaran
igual. Ahora:

- `PassengerConfig` es `{ adults, childrenAges: number[] }` — la edad importa
  porque las tarifas reales varían por franja etaria, no por "es un niño sí/no".
- `PriceBreakdown.passengers` es un `PassengerPriceBreakdown` con
  `adultPrice`, `childPrices[]` y `totalPrice`. Cuando el proveedor solo
  informa un total (`pricingBreakdownAvailable: false`), **nunca se inventa**
  un desglose — se guarda el total tal cual.
- **Dos unidades de precio conviven a propósito**: `FlightResult.price.
  effectivePrice` es el **total de la reserva** (lo que se muestra en
  "Total estimado" de una alerta); `referenceUnitPrice()` (`types.ts`) es el
  **precio de referencia por adulto**, y es el que se compara contra
  `targetPrice`/`maxPrice`, el histórico y el Opportunity Score — igual que
  los ejemplos del spec original ("Precio objetivo: USD 750" junto a "Total
  estimado: USD 3.675" para 5 pasajeros). Mezclar ambas unidades fue un bug
  real que apareció durante el desarrollo de esta versión (alertas dejaban
  de dispararse porque el total de 5 pasajeros superaba un `maxPrice`
  pensado por-adulto) — quedó cubierto por los tests y corregido en un único
  punto (`referenceUnitPrice`).

### Equipaje y booking

`baggageRequirement` en la búsqueda es lo que el usuario **pide**;
`FlightResult.baggage` (`BaggageAllowance`) es lo que la oferta **informa** —
nunca se envía como parámetro de búsqueda al proveedor (las APIs reales no
lo soportan así, ver la auditoría técnica). `engine/filters.ts` expone el
filtro posterior (`filterByBaggageRequirement`) para la UI. `FlightResult.
booking` reemplaza el viejo `bookingUrl: string` por una unión
(`deep_link | api_order | search_link | unavailable`) que no obliga a un
proveedor tipo Duffel (booking vía API, sin link) a fingir que tiene un
enlace. `FlightResult.expiresAt` modela ofertas efímeras — pasado ese
momento la UI muestra "Este precio puede haber cambiado. Actualizar precio."
en vez de asumir que sigue vigente.

### Tests

`npm run test` (Vitest) cubre deduplicación, cache/TTL, retry por código de
error, rate limiting con reloj simulado, continuidad ante errores por
combinación (y aborto correcto en `AUTHENTICATION`/`QUOTA_EXCEEDED`), la
fórmula de precio total, tarifas diferenciadas por edad, equipaje como
"no informado", expiración de ofertas, el Opportunity Score y el presupuesto
de requests.

---

## 5. Instalación local

```bash
npm install
cp .env.example .env.local   # opcional: dejarlo vacío corre en modo demo
npm run dev
```

Abrí `http://localhost:3000`. La primera petición siembra automáticamente dos
búsquedas de ejemplo ("Miami / Orlando Noviembre" y "Madrid Diciembre"),
90 días de histórico simulado por ruta, y corre el motor una vez — vas a ver
el dashboard ya poblado.

En modo demo **no hace falta Supabase**: los datos viven en memoria mientras
el proceso de Node esté corriendo (se resetean si reiniciás `npm run dev`).
Esto es intencional y está documentado en la UI — para persistencia real,
conectá Supabase (sección 6).

Comandos útiles:

```bash
npm run typecheck   # chequeo de tipos
npm run build        # build de producción
npm run lint          # eslint
```

---

## 6. Conectar Supabase (persistencia real)

1. Creá un proyecto en [supabase.com](https://supabase.com).
2. Corré `supabase/schema.sql` completo en el SQL editor del proyecto (crea
   tablas, índices, triggers, RLS y datos de referencia de aeropuertos/
   aerolíneas).
3. Completá en `.env.local` (o en las variables de entorno de Vercel):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
   La `service_role` key es la que usa el backend (rutas de API, cron) para
   escribir sin las restricciones de RLS — nunca se expone al browser.
4. Como todavía no hay pantalla de login, `DEMO_USER_ID` (constante en
   `src/lib/constants.ts`) se usa como usuario único. Para producción real,
   agregá Supabase Auth y reemplazá esa constante por `auth.uid()` — el
   esquema y las policies de RLS ya están preparados para eso (cada tabla
   filtra por `user_id`).

Una vez configuradas esas variables, `getRepository()` cambia automáticamente
a `SupabaseRepository` — ninguna pantalla necesita tocarse.

---

## 7. Conectar una API de vuelos real

**Importante:** no existe una API pública oficial de Google Flights (la
única que existió, QPX Express, cerró en 2018 y nunca tuvo reemplazo
público). Tampoco asumas que **Amadeus Self-Service** sigue siendo una
opción de alta inmediata — Amadeus decomisionó ese portal el 17/07/2026; lo
que queda es Amadeus Enterprise, sin autoservicio. Ver la auditoría técnica
completa (sesión de este proyecto) para el detalle de cada proveedor
investigado — hoy los candidatos con alta self-service real son **Duffel**
(API de booking, tarifas por tipo de pasajero, sandbox gratis) y **SerpApi**
(no oficial, parsea resultados de Google Flights, modelo deep-link). Ninguno
está conectado todavía, y no debe simularse que lo está.

Para conectar una:

1. Creá `src/lib/providers/DuffelFlightProvider.ts` (o el nombre que
   corresponda) implementando la interfaz `FlightSearchProvider`
   (`searchFlights`, `getFlightDetails`, `getPriceCalendar`,
   `getPriceHistory`), y declarando honestamente sus `capabilities` y
   `rateLimit` (ver `providers/FlightSearchProvider.ts` — el motor adapta la
   estrategia de exploración a lo que el proveedor realmente soporta).
2. Registralo en `src/lib/providers/index.ts`:
   ```ts
   import { duffelFlightProvider } from "./DuffelFlightProvider";
   const PROVIDERS = {
     mock: mockFlightProvider,
     duffel: duffelFlightProvider,
   };
   ```
3. Configurá las credenciales en `.env.local`:
   ```
   FLIGHT_API_PROVIDER=duffel
   FLIGHT_API_KEY=...
   ```
4. Nada más cambia: el motor, las pantallas, el scheduler y las alertas ya
   están escritos contra la interfaz, no contra `MockFlightProvider`.

Cambios de modelo a tener en cuenta según el proveedor elegido (ver sección
4bis): si el proveedor es API-order (Duffel/Amadeus) en vez de deep-link
(SerpApi/Skyscanner), `FlightResult.booking` debe devolver `{ type:
"api_order", offerId }` en vez de una URL — la UI ya sabe renderizar ambos
casos. Cuando un componente de precio no venga informado por la API real
(tasas, costo de equipaje, desglose por pasajero), dejalo en `null` — la UI
ya sabe mostrar "no informado" y la capa de análisis nunca inventa ese
número.

---

## 8. Alertas (Telegram / WhatsApp / Email)

La lógica de detección y el mensaje ya están completos
(`src/lib/alerts/engine.ts`, `src/lib/alerts/message.ts`) y cada alerta queda
registrada en la tabla `alerts` con su estado (`sent` / `pending` /
`suppressed_duplicate`). Lo único que falta para que se envíen de verdad es
el adaptador de canal:

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
WHATSAPP_API_KEY=
WHATSAPP_PHONE_NUMBER_ID=
```

Con esas variables completas, agregá en `alerts/engine.ts` (donde se crea la
alerta con `status: "sent"`) una llamada a la API de Telegram
(`https://api.telegram.org/bot<token>/sendMessage`) y/o a la API de WhatsApp
Business con el `message` ya generado. Se dejó fuera del alcance de este
entregable para no simular un envío real sin credenciales.

---

## 9. Programación automática

`src/app/api/cron/route.ts` corre todas las búsquedas activas cuyo
`next_run_at` ya pasó, y vuelve a calcular la próxima corrida según
`src/lib/scheduler/frequency.ts`:

| Cercanía de la fecha de viaje | Búsquedas / día |
|---|---|
| Normal (> 120 días) | 2 |
| 60–120 días | 4 |
| 30–60 días | 6 |
| < 30 días | 6 (≈ cada 4h) |

`vercel.json` configura un cron cada 4 horas hacia `/api/cron`. El plan
Hobby de Vercel limita los crons a 1 vez por día — si necesitás la
granularidad de horas, subí a un plan Pro o apuntá un scheduler externo
(GitHub Actions, cron-job.org, etc.) a ese mismo endpoint. Protegelo con
`CRON_SECRET` en producción.

---

## 10. Deploy en Vercel

1. Importá el repo en Vercel.
2. Framework preset: Next.js (autodetectado).
3. Cargá las variables de entorno de `.env.example` que apliquen (podés
   dejar Supabase vacío para desplegar igual en modo demo).
4. Deploy. El cron de `vercel.json` se activa solo.

---

## 11. Limitaciones conocidas del modo demo

- `InMemoryRepository` vive en memoria del proceso: en un deploy serverless
  cada instancia puede tener su propio estado, y un redeploy lo reinicia.
  Es la elección correcta para que el proyecto funcione "out of the box" sin
  pedir credenciales — para producción real, configurá Supabase.
- Los grupos de aeropuertos alternativos y los buckets del scheduler son
  configuración en código (`src/lib/providers/mockData.ts`,
  `src/lib/scheduler/frequency.ts`) en vez de estar en una tabla editable
  desde la UI. Es una decisión deliberada para priorizar profundidad en el
  motor de oportunidades y las pantallas de análisis dentro del alcance de
  este entregable; el esquema de Supabase se puede extender con una tabla
  `app_settings` sin tocar el resto de la arquitectura.
- La capa de IA (`lib/ai/explain.ts`) es determinística y basada en reglas,
  no llama a un modelo externo — está documentada como el punto exacto donde
  conectar una API de LLM real sin tocar el resto del sistema.

## 12. Futuras funciones (arquitectura ya preparada, no implementadas)

Precios en ARS + tipo de cambio, costo financiero de cuotas, equipaje
adicional, hoteles/auto/paquetes, millas y programas de viajero frecuente,
multiusuario real (Supabase Auth), compartir una búsqueda, integración con
Google Sheets, análisis estacional. El modelo de datos (`types.ts`) y los
adaptadores (`providers/`, `data/`) están diseñados para que ninguna de estas
requiera un rediseño — son campos y tablas nuevas, no cambios estructurales.
