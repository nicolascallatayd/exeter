/**
 * useSupabase.ts — Phase 4
 * Removed: useSeedUserData
 * Added:   useBeneficiaries, useAddBeneficiary, useDeleteBeneficiary,
 *          useExternalTransfers, useSendExternalTransfer, useDeposit
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// Helper function to send transaction alert email
const sendTransactionAlert = async (userId: string, transactionId: string) => {
  try {
    console.log("Fetching transaction for notification:", transactionId);
    const { data, error } = await supabase.rpc("get_transaction_for_notification", {
      p_transaction_id: transactionId,
    });
    console.log("Transaction data response:", data, error);
    if (error || !data?.ok) {
      console.error("Failed to get transaction for notification:", error);
      return;
    }
    
    const transactionData = data as { user_id: string; user_email: string; user_name: string; account_last4: string; beneficiary_account: string; transaction: any };
    console.log("Sending email alert for transaction:", transactionData.transaction);
    
    await supabase.functions.invoke("send-transaction-alert", {
      body: {
        userId: transactionData.user_id,
        transaction: transactionData.transaction,
        accountLast4: transactionData.account_last4,
        beneficiaryAccount: transactionData.beneficiary_account,
      },
    });
    console.log("Email alert sent successfully");
  } catch (err) {
    console.error("Failed to send transaction alert:", err);
  }
};

// ─── Query Keys ───────────────────────────────────────────────

export const keys = {
  accounts:          (uid: string) => ["accounts",           uid] as const,
  transactions:      (uid: string) => ["transactions",       uid] as const,
  cards:             (uid: string) => ["cards",              uid] as const,
  savingsGoals:      (uid: string) => ["savings_goals",      uid] as const,
  investments:       (uid: string) => ["investments",        uid] as const,
  profile:           (uid: string) => ["profile",            uid] as const,
  beneficiaries:     (uid: string) => ["beneficiaries",      uid] as const,
  externalTransfers: (uid: string) => ["external_transfers", uid] as const,
};

// ─── Accounts ─────────────────────────────────────────────────

export const useAccounts = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.accounts(user?.id ?? ""),
    enabled: !!user,
    staleTime: 30_000,  // keep data fresh for 30s before background refetch
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

// ─── Realtime ─────────────────────────────────────────────────

export const useRealtimeAccounts = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`realtime:accounts:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "accounts", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: keys.accounts(userId) }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);
};

export const useRealtimeTransactions = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`realtime:transactions:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: keys.transactions(userId) }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, qc]);
};

// ─── Transactions ─────────────────────────────────────────────

export const useTransactions = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.transactions(user?.id ?? ""),
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// ─── Internal Transfer (between own accounts) ─────────────────

interface InternalTransferArgs {
  fromAccountId: string;
  toAccountId:   string;
  amount:        number;
  note?:         string;
}

interface TransferResult {
  ok:         boolean;
  error?:     string;
  pending?:   boolean;
  reference?: string;
  message?:   string | null;
  debit_id?:  string;
  credit_id?: string;
  from_name?: string;
  to_name?:   string;
  amount?:    number;
}

interface InternalTransferArgs {
  fromAccountId: string;
  toAccountId:   string;
  amount:        number;
  note?:         string;
  otpCode?:      string;
}

export const useTransfer = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fromAccountId, toAccountId, amount, note, otpCode }: InternalTransferArgs) => {
      console.log("Starting transfer:", { fromAccountId, toAccountId, amount, note, otpCode });
      const { data, error } = await supabase.rpc("transfer_funds", {
        p_user_id: user!.id,
        p_from_id: fromAccountId,
        p_to_id:   toAccountId,
        p_amount:  amount,
        p_note:    note ?? null,
        p_otp_code: otpCode ?? null,
      });
      console.log("Transfer RPC response:", data, error);
      if (error) throw new Error(error.message);
      const result = data as TransferResult;
      console.log("Parsed result:", result);
      if (!result.ok) throw new Error(result.error ?? "Transfer failed.");
      return result;
    },
    onSuccess: async (result) => {
      console.log("Transfer successful:", result);
      qc.invalidateQueries({ queryKey: keys.accounts(user?.id ?? "") });
      qc.invalidateQueries({ queryKey: keys.transactions(user?.id ?? "") });
      
      // Send email notifications for debit and credit transactions
      if (result.debit_id) {
        console.log("Sending email for debit transaction:", result.debit_id);
        await sendTransactionAlert(user!.id, result.debit_id);
      }
      if (result.credit_id) {
        console.log("Sending email for credit transaction:", result.credit_id);
        await sendTransactionAlert(user!.id, result.credit_id);
      }
    },
    onError: (error) => {
      console.error("Transfer failed:", error);
    },
  });
};

export const useCustomMessages = () => {
  return useQuery({
    queryKey: ["custom_messages"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_get_settings");
      if (error) throw new Error(error.message);
      return data as Array<{ key: string; value: string }>;
    },
  });
};

// ─── Deposit ──────────────────────────────────────────────────

interface DepositArgs {
  accountId: string;
  amount:    number;
  name?:     string;
  category?: string;
  note?:     string;
}

export const useDeposit = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, amount, name, category, note }: DepositArgs) => {
      const { data, error } = await supabase.rpc("deposit_funds", {
        p_user_id:    user!.id,
        p_account_id: accountId,
        p_amount:     amount,
        p_name:       name     ?? "Deposit",
        p_category:   category ?? "Income",
        p_note:       note     ?? null,
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "Deposit failed.");
      return result;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: keys.accounts(user?.id ?? "") });
      qc.invalidateQueries({ queryKey: keys.transactions(user?.id ?? "") });
      
      // Get the most recent transaction for this user and send alert
      const { data: transactions } = await supabase
        .from("transactions")
        .select("id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (transactions && transactions.length > 0) {
        await sendTransactionAlert(user!.id, transactions[0].id);
      }
    },
  });
};

// ─── Beneficiaries ────────────────────────────────────────────

export const useBeneficiaries = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.beneficiaries(user?.id ?? ""),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficiaries")
        .select("*")
        .eq("user_id", user!.id)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useAddBeneficiary = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (b: {
      full_name:      string;
      bank_name:      string;
      account_number: string;
      routing_number?: string;
      iban?:           string;
      swift_bic?:      string;
      email?:          string;
      nickname?:       string;
      otpCode?:        string;
    }) => {
      const { otpCode, ...beneficiaryData } = b;
      const { data, error } = await supabase.rpc("add_beneficiary_with_otp", {
        p_user_id: user!.id,
        p_full_name: beneficiaryData.full_name,
        p_bank_name: beneficiaryData.bank_name,
        p_account_number: beneficiaryData.account_number,
        p_routing_number: beneficiaryData.routing_number ?? null,
        p_iban: beneficiaryData.iban ?? null,
        p_swift_bic: beneficiaryData.swift_bic ?? null,
        p_email: beneficiaryData.email ?? null,
        p_nickname: beneficiaryData.nickname ?? null,
        p_otp_code: otpCode ?? null,
      });
      if (error) throw new Error(error.message);
      // RPC returns TABLE, so data is an array
      const resultArray = data as Array<{ ok: boolean; error?: string; beneficiary?: any }>;
      const result = resultArray?.[0];
      if (!result?.ok) throw new Error(result.error ?? "Failed to add beneficiary");
      return result.beneficiary;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.beneficiaries(user?.id ?? "") }),
  });
};

export const useDeleteBeneficiary = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, otpCode }: { id: string; otpCode?: string }) => {
      const { data, error } = await supabase.rpc("delete_beneficiary_with_otp", {
        p_beneficiary_id: id,
        p_user_id: user!.id,
        p_otp_code: otpCode ?? null,
      });
      if (error) throw new Error(error.message);
      const result = data as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "Failed to delete beneficiary");
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.beneficiaries(user?.id ?? "") }),
  });
};

export const useUpdateBeneficiary = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      full_name?: string;
      bank_name?: string;
      account_number?: string;
      routing_number?: string;
      iban?: string;
      swift_bic?: string;
      email?: string;
      nickname?: string;
      otpCode?: string;
    }) => {
      const { otpCode, ...beneficiaryData } = args;
      const { data, error } = await supabase.rpc("update_beneficiary_with_otp", {
        p_beneficiary_id: args.id,
        p_user_id: user!.id,
        p_full_name: beneficiaryData.full_name ?? null,
        p_bank_name: beneficiaryData.bank_name ?? null,
        p_account_number: beneficiaryData.account_number ?? null,
        p_routing_number: beneficiaryData.routing_number ?? null,
        p_iban: beneficiaryData.iban ?? null,
        p_swift_bic: beneficiaryData.swift_bic ?? null,
        p_email: beneficiaryData.email ?? null,
        p_nickname: beneficiaryData.nickname ?? null,
        p_otp_code: otpCode ?? null,
      });
      if (error) throw new Error(error.message);
      // RPC returns TABLE, so data is an array
      const resultArray = data as Array<{ ok: boolean; error?: string; beneficiary?: any }>;
      const result = resultArray?.[0];
      console.log("Update beneficiary result:", result);
      if (!result?.ok) throw new Error(result.error ?? "Failed to update beneficiary");
      return result.beneficiary;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.beneficiaries(user?.id ?? "") }),
  });
};

// ─── External Transfer ────────────────────────────────────────

interface ExternalTransferArgs {
  accountId:        string;
  beneficiaryId?:   string;
  beneficiaryName:  string;
  bankName:         string;
  accountNumber:    string;
  amount:           number;
  note?:            string;
  saveBeneficiary?: boolean;
  swiftBic?:        string;
  iban?:            string;
  otpCode?:         string;
}

interface ExternalTransferResult {
  ok:              boolean;
  error?:          string;
  pending?:        boolean;
  message?:        string | null;
  transfer_id?:    string;
  tx_id?:          string;
  reference?:      string;
  beneficiary_id?: string;
  amount?:         number;
  fee?:            number;
}

export const useSendExternalTransfer = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: ExternalTransferArgs) => {
      console.log("Starting external transfer:", args);
      const { data, error } = await supabase.rpc("send_external_transfer", {
        p_user_id:          user!.id,
        p_account_id:       args.accountId,
        p_beneficiary_id:   args.beneficiaryId   ?? null,
        p_beneficiary_name: args.beneficiaryName,
        p_bank_name:        args.bankName,
        p_account_number:   args.accountNumber,
        p_amount:           args.amount,
        p_note:             args.note             ?? null,
        p_save_beneficiary: args.saveBeneficiary  ?? false,
        p_swift_bic:        args.swiftBic         ?? null,
        p_iban:             args.iban             ?? null,
        p_otp_code:         args.otpCode          ?? null,
      });
      console.log("External transfer RPC response:", data, error);
      if (error) throw new Error(error.message);
      const result = data as ExternalTransferResult;
      console.log("Parsed external transfer result:", result);
      if (!result.ok) throw new Error(result.error ?? "Transfer failed.");
      return result;
    },
    onSuccess: async (result) => {
      console.log("External transfer successful:", result);
      qc.invalidateQueries({ queryKey: keys.accounts(user?.id ?? "") });
      qc.invalidateQueries({ queryKey: keys.transactions(user?.id ?? "") });
      qc.invalidateQueries({ queryKey: keys.beneficiaries(user?.id ?? "") });
      qc.invalidateQueries({ queryKey: keys.externalTransfers(user?.id ?? "") });
      
      // Send email notification for the transaction if tx_id is available
      if (result.tx_id) {
        console.log("Sending email for external transfer transaction:", result.tx_id);
        await sendTransactionAlert(user!.id, result.tx_id);
      }
    },
    onError: (error) => {
      console.error("External transfer failed:", error);
    },
  });
};

// Request a transfer OTP to be emailed to the signed-in user. The 6-digit code
// is generated server-side by the send-transfer-otp Edge Function and is never
// returned to the client — it only reaches the user by email.
export const useSendTransferOtp = () =>
  useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await supabase.functions.invoke("send-transfer-otp", {
        body: { accountId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { ok: boolean };
    },
  });

export const useExternalTransfers = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.externalTransfers(user?.id ?? ""),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_transfers")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// ─── Cards ────────────────────────────────────────────────────

export const useCards = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.cards(user?.id ?? ""),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useToggleCardFreeze = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, frozen }: { id: string; frozen: boolean }) => {
      const { error } = await supabase.from("cards").update({ frozen }).eq("id", id).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.cards(user?.id ?? "") }),
  });
};

// ─── Savings Goals ────────────────────────────────────────────

export const useSavingsGoals = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.savingsGoals(user?.id ?? ""),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

export const useInsertSavingsGoal = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: { name: string; target: number }) => {
      const { data, error } = await supabase
        .from("savings_goals")
        .insert({ ...goal, user_id: user!.id, current: 0 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.savingsGoals(user?.id ?? "") }),
  });
};

export const useDeleteSavingsGoal = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("savings_goals").delete().eq("id", id).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.savingsGoals(user?.id ?? "") }),
  });
};

// ─── Investments ──────────────────────────────────────────────

export const useInvestments = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.investments(user?.id ?? ""),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investments")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
};

// ─── Profile ──────────────────────────────────────────────────

export const useUpdateProfile = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { full_name?: string }) => {
      const { error } = await supabase.from("profiles").update(updates).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile(user?.id ?? "") }),
  });
};

// Submits a user-initiated profile edit. The RPC writes the changes and flips
// approval_status back to 'pending' — an admin must re-approve before the
// account regains full dashboard access.
export const useSubmitProfileUpdate = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: {
      full_name: string;
      avatar_url?: string | null;
      profile_data: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc("submit_profile_update", {
        p_full_name:    updates.full_name,
        p_profile_data: updates.profile_data,
        p_avatar_url:   updates.avatar_url ?? null,
      });
      if (error) throw new Error(error.message);
      const r = data as { ok: boolean; error?: string };
      if (!r.ok) throw new Error(r.error ?? "Failed to submit profile update");
      return r;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile(user?.id ?? "") }),
  });
};

export const useUpdatePassword = () => {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
  });
};
