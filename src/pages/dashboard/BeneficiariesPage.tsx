import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, Edit2, Search, Building2, User, KeyRound,
  RefreshCw, Check, AlertCircle, Loader2, X,
} from "lucide-react";
import {
  useBeneficiaries, useAddBeneficiary, useDeleteBeneficiary,
  useUpdateBeneficiary, useSendTransferOtp, useAccounts,
} from "@/hooks/useSupabase";
import { toast } from "sonner";

type Beneficiary = {
  id: string;
  full_name: string;
  bank_name: string;
  account_number: string;
  routing_number?: string;
  iban?: string;
  swift_bic?: string;
  email?: string;
  nickname?: string;
  created_at: string;
};

type FormMode = "create" | "edit";
type FormStep = "details" | "confirm" | "success";

const BeneficiariesPage = () => {
  const { data: beneficiaries, isLoading } = useBeneficiaries();
  const { data: accounts } = useAccounts();
  const addBeneficiary = useAddBeneficiary();
  const deleteBeneficiary = useDeleteBeneficiary();
  const updateBeneficiary = useUpdateBeneficiary();
  const sendOtp = useSendTransferOtp();

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<FormMode | null>(null);
  const [step, setStep] = useState<FormStep>("details");
  const [editingBene, setEditingBene] = useState<Beneficiary | null>(null);
  const [otpCode, setOtpCode] = useState("");

  // Form state
  const [fullName, setFullName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [iban, setIban] = useState("");
  const [swiftBic, setSwiftBic] = useState("");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");

  const filteredBeneficiaries = beneficiaries?.filter((b) =>
    b.full_name.toLowerCase().includes(search.toLowerCase()) ||
    b.bank_name.toLowerCase().includes(search.toLowerCase()) ||
    (b.nickname && b.nickname.toLowerCase().includes(search.toLowerCase()))
  ) ?? [];

  const resetForm = () => {
    setMode(null);
    setStep("details");
    setEditingBene(null);
    setOtpCode("");
    setFullName("");
    setBankName("");
    setAccountNumber("");
    setRoutingNumber("");
    setIban("");
    setSwiftBic("");
    setEmail("");
    setNickname("");
  };

  const openCreate = () => {
    setMode("create");
    setStep("details");
  };

  const openEdit = (bene: Beneficiary) => {
    setEditingBene(bene);
    setMode("edit");
    setStep("details");
    setFullName(bene.full_name);
    setBankName(bene.bank_name);
    setAccountNumber(bene.account_number);
    setRoutingNumber(bene.routing_number || "");
    setIban(bene.iban || "");
    setSwiftBic(bene.swift_bic || "");
    setEmail(bene.email || "");
    setNickname(bene.nickname || "");
  };

  const requestOtp = () => {
    setOtpCode("");
    // Use the first available account for OTP verification
    const firstAccount = accounts?.[0];
    if (!firstAccount) {
      toast.error("No account found for verification");
      return;
    }
    sendOtp.mutate(firstAccount.id, {
      onSuccess: () => toast.success("A 6-digit code has been sent to your email."),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  const handleConfirm = () => {
    const beneficiaryData = {
      full_name: fullName,
      bank_name: bankName,
      account_number: accountNumber,
      routing_number: routingNumber || undefined,
      iban: iban || undefined,
      swift_bic: swiftBic || undefined,
      email: email || undefined,
      nickname: nickname || undefined,
      otpCode: otpCode || undefined,
    };

    if (mode === "create") {
      addBeneficiary.mutate(beneficiaryData, {
        onSuccess: () => {
          toast.success("Beneficiary added successfully");
          setStep("success");
        },
        onError: (e: Error) => toast.error(e.message),
      });
    } else if (mode === "edit" && editingBene) {
      updateBeneficiary.mutate({
        id: editingBene.id,
        ...beneficiaryData,
      }, {
        onSuccess: () => {
          toast.success("Beneficiary updated successfully");
          setStep("success");
        },
        onError: (e: Error) => toast.error(e.message),
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this beneficiary?")) {
      // For delete, we need OTP confirmation
      setOtpCode("");
      const firstAccount = accounts?.[0];
      if (!firstAccount) {
        toast.error("No account found for verification");
        return;
      }
      sendOtp.mutate(firstAccount.id, {
        onSuccess: () => {
          const code = prompt("Enter the 6-digit code sent to your email:");
          if (code) {
            deleteBeneficiary.mutate({ id, otpCode: code }, {
              onSuccess: () => toast.success("Beneficiary deleted"),
              onError: (e: Error) => toast.error(e.message),
            });
          }
        },
        onError: (e: Error) => toast.error(e.message),
      });
    }
  };

  // Main view
  if (!mode) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Beneficiaries</h1>
            <p className="text-sm text-muted-foreground">Manage your saved recipients for transfers.</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus size={18} />
            Add Beneficiary
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search beneficiaries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border/50 bg-muted/50 pl-10 text-foreground"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredBeneficiaries.length === 0 ? (
          <div className="rounded border border-border/40 bg-gradient-card p-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-semibold text-foreground">No beneficiaries found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {search ? "Try a different search term" : "Add your first beneficiary to get started"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBeneficiaries.map((bene) => (
              <motion.div
                key={bene.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded border border-border/40 bg-gradient-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {bene.full_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(bene)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(bene.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{bene.nickname || bene.full_name}</p>
                  {bene.nickname && bene.nickname !== bene.full_name && (
                    <p className="text-xs text-muted-foreground">{bene.full_name}</p>
                  )}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 size={14} />
                    <span>{bene.bank_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User size={14} />
                    <span>****{bene.account_number.slice(-4)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Form view
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={step === "success" ? resetForm : step === "details" ? resetForm : () => setStep("details")}
          className="text-muted-foreground hover:text-foreground">
          {step === "success" ? <X size={20} /> : <RefreshCw size={20} />}
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {mode === "create" ? "Add Beneficiary" : "Edit Beneficiary"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "details" ? "Enter recipient details" : step === "confirm" ? "Confirm and verify" : "Success"}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === "details" && (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-foreground">Full Name *</Label>
                <Input
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Nickname</Label>
                <Input
                  placeholder="Optional display name"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Bank Name *</Label>
                <Input
                  placeholder="Chase, HSBC, etc."
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Account Number *</Label>
                <Input
                  placeholder="e.g. 000123456789"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Routing / Sort Code</Label>
                <Input
                  placeholder="Optional"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">IBAN</Label>
                <Input
                  placeholder="Optional"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">SWIFT / BIC</Label>
                <Input
                  placeholder="Optional"
                  value={swiftBic}
                  onChange={(e) => setSwiftBic(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Recipient Email</Label>
                <Input
                  type="email"
                  placeholder="Optional"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-border/50 bg-muted/50 text-foreground"
                />
              </div>
            </div>

            <Button
              variant="hero"
              className="w-full"
              size="lg"
              disabled={!fullName || !bankName || !accountNumber}
              onClick={() => {
                setStep("confirm");
                requestOtp();
              }}
            >
              Continue <RefreshCw size={18} />
            </Button>
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="rounded border border-border/40 bg-gradient-card p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold text-foreground text-center">
                {mode === "create" ? "Add Beneficiary" : "Update Beneficiary"}
              </h2>

              <div className="space-y-3">
                {[
                  { label: "Full Name", value: fullName },
                  { label: "Nickname", value: nickname || "—" },
                  { label: "Bank Name", value: bankName },
                  { label: "Account Number", value: `****${accountNumber.slice(-4)}` },
                  { label: "Routing / Sort Code", value: routingNumber || "—" },
                  { label: "IBAN", value: iban || "—" },
                  { label: "SWIFT / BIC", value: swiftBic || "—" },
                  { label: "Email", value: email || "—" },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between border-b border-border/20 pb-2">
                    <span className="text-sm text-muted-foreground">{r.label}</span>
                    <span className="text-sm font-medium text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 rounded bg-primary/5 p-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-xs text-muted-foreground">
                  Please verify the details above. You can edit this beneficiary later if needed.
                </p>
              </div>

              <div className="space-y-2 rounded border border-border/40 bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <KeyRound size={14} className="text-muted-foreground" />
                  <p className="text-xs font-medium text-foreground">Email verification code</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {sendOtp.isPending
                    ? "Sending a 6-digit code to your email…"
                    : "We've emailed a 6-digit code to your registered email. Enter it below to authorize this action."}
                </p>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="border-border/50 bg-background font-mono tracking-widest text-foreground"
                />
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={sendOtp.isPending}
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {sendOtp.isPending ? "Sending…" : "Resend code"}
                </button>
              </div>

              <Button
                variant="hero"
                className="w-full"
                size="lg"
                onClick={handleConfirm}
                disabled={addBeneficiary.isPending || !otpCode.trim()}
              >
                {addBeneficiary.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Processing…
                  </>
                ) : (
                  mode === "create" ? "Add Beneficiary" : "Update Beneficiary"
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {step === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="rounded border border-border/40 bg-gradient-card p-8 text-center space-y-4"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check size={32} className="text-primary" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">
              {mode === "create" ? "Beneficiary Added!" : "Beneficiary Updated!"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {fullName} has been {mode === "create" ? "added to" : "updated in"} your beneficiaries list.
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="hero" className="flex-1" onClick={resetForm}>
                Done
              </Button>
              <Button variant="heroOutline" className="flex-1" onClick={openCreate}>
                Add Another
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BeneficiariesPage;
