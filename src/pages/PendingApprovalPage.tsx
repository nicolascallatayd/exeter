import { motion } from "framer-motion";
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, type ApprovalStatus } from "@/contexts/AuthContext";
import { getBlockedStatusCopy, type BlockedStatus } from "@/lib/accountStatusContent";

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: "text-yellow-500",
    badge: "bg-yellow-500/10 border-yellow-500/30 text-yellow-500",
    heading: "Your account is under review",
    body: "We're verifying your identity documents. This usually takes 1–2 business days. You'll be able to access your dashboard once approved.",
  },
} as const;

const PendingApprovalPage = () => {
  const { profile, logout } = useAuth();
  const status = (profile?.approval_status ?? "pending") as Exclude<ApprovalStatus, "approved">;
  const cfg = status === "pending"
    ? STATUS_CONFIG.pending
    : getBlockedStatusCopy(status as BlockedStatus, profile?.hold_reason ?? null);
  const Icon = cfg.icon;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="pointer-events-none absolute inset-0 bg-glow" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="font-display text-2xl font-bold text-foreground">ExeterTrustCo</span>
        </div>

        <div className="rounded border border-border/50 bg-gradient-card p-8 shadow-card text-center space-y-6">
          {/* Icon */}
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${cfg.badge}`}>
            <Icon size={28} className={cfg.color} />
          </div>

          {/* Status badge */}
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.color.replace("text-", "bg-")}`} />
            {status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>

          {/* Text */}
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-foreground">{cfg.heading}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{cfg.body}</p>
          </div>

          {/* User info */}
          {profile?.email && (
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{profile.email}</span>
            </p>
          )}

          {/* Sign out */}
          <Button variant="outline" className="w-full" onClick={logout}>
            <LogOut size={15} className="mr-2" /> Sign out
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default PendingApprovalPage;

