import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowDownLeft, Search, Loader2, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTransactions, useRealtimeTransactions } from "@/hooks/useSupabase";
import { formatCurrency, formatDate } from "@/lib/format";

const filters = ["All", "Income", "Expenses", "Transfers"] as const;
type Filter = (typeof filters)[number];

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

const TransactionsPage = () => {
  const [search, setSearch]             = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

  const { data: transactions, isLoading, error } = useTransactions();

  // New transactions appear instantly after a transfer
  useRealtimeTransactions();

  const filtered = (transactions ?? []).filter((tx) => {
    const matchesSearch  = tx.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter  =
      activeFilter === "All" ||
      (activeFilter === "Income"    && tx.type === "credit") ||
      (activeFilter === "Expenses"  && tx.type === "debit" && tx.category !== "Transfer") ||
      (activeFilter === "Transfers" && tx.category === "Transfer");
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Transactions</h1>
        <p className="text-sm text-muted-foreground">View and search all your transactions.</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search transactions..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-border/50 bg-muted/50 pl-10 text-foreground placeholder:text-muted-foreground" />
        </div>
        <div className="flex gap-2">
          {filters.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      )}

      {error && <p className="text-sm text-destructive">Failed to load transactions. Please refresh.</p>}

      {!isLoading && (
        <div className="rounded border border-border/40 bg-gradient-card">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No transactions found.</p>
          ) : (
            filtered.map((tx, i) => (
              <motion.div key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => setSelectedTransaction(tx)}
                className={`flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors ${
                  i !== filtered.length - 1 ? "border-b border-border/20" : ""
                }`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    tx.type === "credit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {tx.type === "credit" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{tx.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {tx.category === "Admin" ? "Internal Systems" : tx.category}
                      </p>
                      {tx.status && getStatusBadge(tx.status as TransactionStatus)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${tx.type === "credit" ? "text-primary" : "text-foreground"}`}>
                    {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                </div>
              </motion.div>
            ))
          )}
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
                  <span className="text-sm font-medium text-foreground">
                    {selectedTransaction.category === "Admin" ? "Internal Systems" : selectedTransaction.category}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Type</span>
                  <span className="text-sm font-medium text-foreground capitalize">{selectedTransaction.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Date</span>
                  <span className="text-sm font-medium text-foreground">{formatDate(selectedTransaction.created_at)}</span>
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

export default TransactionsPage;
