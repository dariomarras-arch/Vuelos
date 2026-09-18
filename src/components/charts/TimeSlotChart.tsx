"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TimeSlotStat } from "@/lib/types";

export function TimeSlotChart({ data, currency = "USD" }: { data: TimeSlotStat[]; currency?: string }) {
  const withData = data.filter((d) => d.averagePrice !== null);
  const min = withData.length ? Math.min(...withData.map((d) => d.averagePrice as number)) : null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#252e3d" vertical={false} />
        <XAxis dataKey="slot" tick={{ fill: "#7c8fab", fontSize: 11 }} axisLine={{ stroke: "#252e3d" }} tickLine={false} />
        <YAxis tick={{ fill: "#7c8fab", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          contentStyle={{ background: "#12161d", border: "1px solid #252e3d", borderRadius: 8, fontSize: 12 }}
          formatter={(value: number, _name, item) => [
            value !== null ? `${currency} ${Math.round(value)}` : "s/d",
            `Promedio (${item.payload.flightCount} vuelos)`,
          ]}
        />
        <Bar dataKey="averagePrice" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.averagePrice !== null && d.averagePrice === min ? "#2dd4bf" : "#475873"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
