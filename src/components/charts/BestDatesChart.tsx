"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortDate } from "@/lib/utils/format";

export interface DatePricePoint {
  date: string;
  price: number;
}

export function BestDatesChart({ data, currency = "USD" }: { data: DatePricePoint[]; currency?: string }) {
  if (data.length === 0) {
    return <div className="flex h-56 items-center justify-center text-sm text-base-500">Sin datos de calendario todavía.</div>;
  }
  const min = Math.min(...data.map((d) => d.price));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#252e3d" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fill: "#7c8fab", fontSize: 11 }}
          axisLine={{ stroke: "#252e3d" }}
          tickLine={false}
        />
        <YAxis tick={{ fill: "#7c8fab", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          contentStyle={{ background: "#12161d", border: "1px solid #252e3d", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => shortDate(String(v))}
          formatter={(value: number) => [`${currency} ${Math.round(value)}`, "Precio"]}
        />
        <Bar dataKey="price" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.price === min ? "#2dd4bf" : "#475873"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
