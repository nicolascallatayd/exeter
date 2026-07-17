import { useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { useAuth, type ApprovalStatus } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Loader2, LogOut } from "lucide-react";
import ReauthModal from "@/components/ReauthModal";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import PendingApprovalPage from "@/pages/PendingApprovalPage";
import PhoneVerificationStep from "@/components/PhoneVerificationStep";
import UserMenu from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { getBlockedStatusCopy, type BlockedStatus } from "@/lib/accountStatusContent";

// Statuses that keep the sidebar visible but block the content area
const SIDEBAR_BLOCKED: ApprovalStatus[] = ["suspended", "frozen", "on_hold"];

const BlockedContent = ({ status, reason }: { status: BlockedStatus; reason?: string | null }) => {
  const { logout } = useAuth();
  const cfg = getBlockedStatusCopy(status, reason);
  const Icon = cfg.icon;
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="w-full max-w-md rounded border border-border/50 bg-gradient-card p-8 text-center space-y-5 shadow-card">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${cfg.badge}`}>
          <Icon size={24} className={cfg.color} />
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.color.replace("text-", "bg-")}`} />
          {status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
        <div className="space-y-2">
          <h2 className="font-display text-lg font-bold text-foreground">{cfg.heading}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{cfg.body}</p>
        </div>
        <Button variant="outline" className="w-full" onClick={logout}>
          <LogOut size={14} className="mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
};

const DashboardLayout = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const blockedReason = profile?.hold_reason ?? null;

  const skipPhoneVerification = import.meta.env.VITE_SKIP_PHONE_VERIFICATION === "true";

  useEffect(() => {
    if (!skipPhoneVerification || !profile || profile.phone_verified) return;

    const autoVerify = async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ phone_verified: true })
        .eq("id", profile.id);

      if (error) {
        console.error("Failed to auto-mark phone as verified:", error);
        return;
      }

      await refreshProfile();
    };

    autoVerify();
  }, [skipPhoneVerification, profile, refreshProfile]);

  useSessionTimeout();

  const { data: isAdmin, isLoading: checkingAdmin } = useIsAdmin();

  if (loading || checkingAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (isAdmin) return <Navigate to="/admin" replace />;

  // Phone verification must complete before anything else (can be skipped in development)
  if (!skipPhoneVerification && profile && !profile.phone_verified) {
    return <PhoneVerificationStep />;
  }

  // pending → full-screen (no sidebar)
  if (profile && profile.approval_status === "pending") {
    return <PendingApprovalPage />;
  }

  const status = profile?.approval_status;
  const isSidebarBlocked = status && (SIDEBAR_BLOCKED as string[]).includes(status);

  return (
    <SidebarProvider>
      <ReauthModal />

      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center border-b border-border/30 px-4">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="ml-auto flex items-center gap-3">
              <UserMenu />
            </div>
          </header>
          <main className="flex flex-1 overflow-auto">
            {isSidebarBlocked ? (
              <BlockedContent status={status as BlockedStatus} reason={blockedReason} />
            ) : (
              <div className="flex-1 p-6">
                <Outlet />
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
