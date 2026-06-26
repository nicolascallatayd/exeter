import { useState } from "react";
import { Search, ArrowUpRight, ArrowDownLeft, Loader2, ArrowLeftRight, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminAllTransactions, useRealtimeAdminTransactions } from "@/hooks/useAdmin";
import { formatCurrency, formatDate } from "@/lib/format";
import { motion } from "framer-motion";

const FILTERS = ["All", "Income", "Expenses", "Transfers", "Deposit", "Admin"] as const;
type Filter = (typeof FILTERS)[number];

type TransactionStatus = "completed" | "pending" | "failed" | "cancelled";

const getStatusBadge = (status: TransactionStatus) => {
  switch (status) {
    case "completed":
      return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case "pending":
      return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case "failed":
      return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20"><AlertCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const AdminTransactions = () => {
  const { data: txns, isLoading } = useAdminAllTransactions();
  useRealtimeAdminTransactions();

  const [search, setSearch]           = useState("");
  const [activeFilter, setFilter]     = useState<Filter>("All");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  const filtered = (txns ?? []).filter((tx) => {
    const matchSearch =
      tx.name.toLowerCase().includes(search.toLowerCase()) ||
      tx.category.toLowerCase().includes(search.toLowerCase()) ||
      tx.user_id.includes(search);
    const matchFilter =
      activeFilter === "All"      ||
      (activeFilter === "Income"   && tx.type === "credit"  && tx.category !== "Deposit" && tx.category !== "Admin") ||
      (activeFilter === "Expenses" && tx.type === "debit"   && tx.category !== "Transfer" && tx.category !== "Admin") ||
      (activeFilter === "Transfers"&& tx.category === "Transfer") ||
      (activeFilter === "Deposit"  && tx.category === "Deposit") ||
      (activeFilter === "Admin"    && tx.category === "Admin");
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">All Transactions</h1>
        <p className="text-sm text-muted-foreground">{txns?.length ?? 0} transactions across all users.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, category, user ID…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="border-border/50 bg-muted/50 pl-10 text-foreground" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeFilter === f ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}>{f}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-dashed border-border/50 p-10 text-center">
          <ArrowLeftRight size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No transactions found.</p>
        </div>
      ) : (
        <div className="rounded border border-border/40 overflow-hidden">
          <div className="grid grid-cols-5 gap-4 border-b border-border/20 bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span className="col-span-2">Transaction</span>
            <span>Category</span>
            <span>Date</span>
            <span className="text-right">Amount</span>
          </div>
          {filtered.map((tx, i) => (
            <motion.div key={tx.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.3) }}
              onClick={() => setSelectedTransaction(tx)}
              className={`grid grid-cols-5 gap-4 items-center px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${
                i !== filtered.length - 1 ? "border-b border-border/20" : ""
              }`}>
              <div className="col-span-2 flex items-center gap-3 min-w-0">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  tx.type === "credit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {tx.type === "credit" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs text-muted-foreground truncate">{tx.user_id.slice(0, 8)}…</p>
                    {tx.status && getStatusBadge(tx.status as TransactionStatus)}
                  </div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{tx.category}</span>
              <span className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</span>
              <p className={`text-right text-sm font-semibold ${tx.type === "credit" ? "text-primary" : "text-foreground"}`}>
                {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Transaction Details Modal */}
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  selectedTransaction.type === "credit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {selectedTransaction.type === "credit" ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${selectedTransaction.type === "credit" ? "text-primary" : "text-foreground"}`}>
                    {selectedTransaction.type === "credit" ? "+" : "-"}{formatCurrency(selectedTransaction.amount)}
                  </p>
                  {selectedTransaction.status && getStatusBadge(selectedTransaction.status as TransactionStatus)}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Transaction Name</span>
                  <span className="text-sm font-medium text-foreground">{selectedTransaction.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Category</span>
                  <span className="text-sm font-medium text-foreground">{selectedTransaction.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <span className="text-sm font-medium text-foreground capitalize">{selectedTransaction.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Date</span>
                  <span className="text-sm font-medium text-foreground">{formatDate(selectedTransaction.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">User ID</span>
                  <span className="text-sm font-mono text-muted-foreground">{selectedTransaction.user_id.slice(0, 8)}…</span>
                </div>
                {selectedTransaction.note && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Note</span>
                    <span className="text-sm font-medium text-foreground text-right max-w-[200px]">{selectedTransaction.note}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Transaction ID</span>
                  <span className="text-sm font-mono text-muted-foreground">{selectedTransaction.id.slice(0, 8)}…</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTransactions;
