import { ShieldAlert, Snowflake, PauseCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BlockedStatus = "suspended" | "frozen" | "on_hold";

export interface StatusContentConfig {
  icon: LucideIcon;
  color: string;
  badge: string;
  heading: string;
  body: string;
}

const FALLBACKS: Record<BlockedStatus, StatusContentConfig> = {
  suspended: {
    icon: ShieldAlert,
    color: "text-orange-500",
    badge: "bg-orange-500/10 border-orange-500/30 text-orange-500",
    heading: "Account suspended",
    body: "Your account has been temporarily suspended. Please contact support if you believe this is a mistake.",
  },
  frozen: {
    icon: Snowflake,
    color: "text-blue-500",
    badge: "bg-blue-500/10 border-blue-500/30 text-blue-500",
    heading: "Account frozen",
    body: "Your account has been frozen pending further review. Please contact support for assistance.",
  },
  on_hold: {
    icon: PauseCircle,
    color: "text-muted-foreground",
    badge: "bg-muted/50 border-border/50 text-muted-foreground",
    heading: "Account on hold",
    body: "Your account is temporarily on hold. Our team is reviewing your information and will reach out shortly.",
  },
};

export const getBlockedStatusCopy = (status: BlockedStatus, reason?: string | null): StatusContentConfig => {
  const fallback = FALLBACKS[status] ?? FALLBACKS.on_hold;
  const trimmedReason = reason?.trim();

  return {
    ...fallback,
    body: trimmedReason ? trimmedReason : fallback.body,
  };
};
