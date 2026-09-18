"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortDate } from "@/lib/utils/format";

export interface HistoryPoint {
  date: string;
  price: number;
}

export function PriceHistoryChart({ data, currency = "USD" }: { data: HistoryPoint[]; currency?: string }) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-base-500">Histórico insuficiente todavía.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#252e3d" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fill: "#7c8fab", fontSize: 11 }}
          axisLine={{ stroke: "#252e3d" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "#7c8fab", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => `${currency} ${v}`}
        />
        <Tooltip
          contentStyle={{ background: "#12161d", border: "1px solid #252e3d", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => shortDate(String(v))}
          formatter={(value: number) => [`${currency} ${Math.round(value)}`, "Precio"]}
        />
        <Area type="monotone" dataKey="price" stroke="#2dd4bf" strokeWidth={2} fill="url(#priceFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
