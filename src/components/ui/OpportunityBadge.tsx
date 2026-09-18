import clsx from "clsx";
import { OpportunityLevel } from "@/lib/types";

const LEVEL_LABEL: Record<OpportunityLevel, string> = {
  EXCEPCIONAL: "Excepcional",
  MUY_INTERESANTE: "Muy interesante",
  INTERESANTE: "Interesante",
  NORMAL: "Normal",
  ALTO: "Alto",
};

const LEVEL_CLASS: Record<OpportunityLevel, string> = {
  EXCEPCIONAL: "bg-opp-exceptional/15 text-opp-exceptional ring-1 ring-opp-exceptional/30",
  MUY_INTERESANTE: "bg-opp-great/15 text-opp-great ring-1 ring-opp-great/30",
  INTERESANTE: "bg-opp-interesting/15 text-opp-interesting ring-1 ring-opp-interesting/30",
  NORMAL: "bg-opp-normal/15 text-opp-normal ring-1 ring-opp-normal/30",
  ALTO: "bg-opp-high/15 text-opp-high ring-1 ring-opp-high/30",
};

export function OpportunityBadge({ level, className }: { level: OpportunityLevel; className?: string }) {
  return <span className={clsx("badge", LEVEL_CLASS[level], className)}>{LEVEL_LABEL[level]}</span>;
}
