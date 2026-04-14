import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Flag, Pencil, Trash2, ArrowLeft, Eye } from "lucide-react";
import Header from "@/components/layout/Header";
import { useAdminProperties } from "@/hooks/useProperties";
import { useToast } from "@/hooks/use-toast";
import SEO from "@/components/SEO";

function formatPrice(price: number, listingType: string) {
  if (listingType === "rent") return `₹${price.toLocaleString("en-IN")}/mo`;
  if (price >= 10000000) return `₹${(price / 10000000).toFixed(2)} Cr`;
  if (price >= 100000)   return `₹${(price / 100000).toFixed(2)} L`;
  return `₹${price.toLocaleString("en-IN")}`;
}

const reviewBadge: Record<string, { label: string; cls: string }> = {
  pending:  { label: "Pending",  cls: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-800" },
  flagged:  { label: "Flagged",  cls: "bg-orange-100 text-orange-800" },
};

const statusBadge: Record<string, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-green-600 text-white" },
  sold:      { label: "Sold",      cls: "bg-red-600 text-white" },
  rented:    { label: "Rented",    cls: "bg-blue-600 text-white" },
  expired:   { label: "Expired",   cls: "bg-gray-400 text-white" },
};

type Tab = 'pending' | 'all' | 'flagged' | 'rejected';

const AdminReview = () => {
  const { properties, loading, error, updateReview, deleteProperty } = useAdminProperties();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab]   = useState<Tab>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = properties.filter((p) => {
    if (tab === 'pending')  return p.reviewStatus === 'pending';
    if (tab === 'flagged')  return p.reviewStatus === 'flagged';
    if (tab === 'rejected') return p.reviewStatus === 'rejected';
    return true;
  });

  const counts = {
    pending:  properties.filter((p) => p.reviewStatus === 'pending').length,
    flagged:  properties.filter((p) => p.reviewStatus === 'flagged').length,
    rejected: properties.filter((p) => p.reviewStatus === 'rejected').length,
    all:      properties.length,
  };

  async function handleReview(id: string, review_status: 'approved' | 'rejected' | 'flagged' | 'pending') {
    setBusy(id + review_status);
    try {
      await updateReview(id, review_status);
      toast({ title: `Marked as ${review_status}` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
    setBusy(null);
  }

  async function handleDelete(id: string) {
    setBusy(id + 'delete');
    try {
      await deleteProperty(id);
      toast({ title: "Property deleted" });
      setConfirmDelete(null);
    } catch (err: any) {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    }
    setBusy(null);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pending',  label: `Pending (${counts.pending})` },
    { key: 'flagged',  label: `Flagged (${counts.flagged})` },
    { key: 'rejected', label: `Rejected (${counts.rejected})` },
    { key: 'all',      label: `All (${counts.all})` },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Admin Review | Preinvesto" description="" />
      <Header />
      <div className="flex-1 pt-20 md:pt-24 pb-10">
        <div className="container max-w-6xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Property Review</h1>
              <p className="text-sm text-muted-foreground mt-1">Manage all submitted property listings.</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && <p className="text-destructive text-center py-10">{error}</p>}

          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">No properties in this category.</div>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((p) => {
                const rv = reviewBadge[p.reviewStatus ?? 'pending'];
                const sv = statusBadge[p.status ?? 'available'];
                const isBusy = (action: string) => busy === p.id + action;
                return (
                  <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="flex gap-4 p-4">
                      {/* Thumbnail */}
                      <div className="w-24 h-20 shrink-0 rounded-lg overflow-hidden bg-muted">
                        <img
                          src={p.featuredImage}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rv.cls}`}>{rv.label}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sv.cls}`}>{sv.label}</span>
                        </div>
                        <h3 className="font-semibold text-foreground text-sm line-clamp-1">{p.title}</h3>
                        <p className="text-accent font-bold text-sm">{formatPrice(p.price, p.listingType)}</p>
                        <p className="text-xs text-muted-foreground">{p.locality}, {p.city} · {p.propertyType} · {p.listedBy}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Added: {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {p.contactName && ` · ${p.contactName}`}
                          {p.contactPhone && ` · ${p.contactPhone}`}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Link
                          to={`/properties/${p.id}`}
                          target="_blank"
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-muted text-foreground rounded-md hover:bg-muted/80 transition-colors"
                        >
                          <Eye className="w-3 h-3" /> View
                        </Link>
                        <button
                          onClick={() => handleReview(p.id, 'approved')}
                          disabled={!!busy || p.reviewStatus === 'approved'}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-green-100 text-green-800 rounded-md hover:bg-green-200 disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" />
                          {isBusy('approved') ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReview(p.id, 'flagged')}
                          disabled={!!busy || p.reviewStatus === 'flagged'}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-orange-100 text-orange-800 rounded-md hover:bg-orange-200 disabled:opacity-50 transition-colors"
                        >
                          <Flag className="w-3 h-3" />
                          {isBusy('flagged') ? '...' : 'Flag'}
                        </button>
                        <button
                          onClick={() => handleReview(p.id, 'rejected')}
                          disabled={!!busy || p.reviewStatus === 'rejected'}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-red-100 text-red-800 rounded-md hover:bg-red-200 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          {isBusy('rejected') ? '...' : 'Reject'}
                        </button>
                        <Link
                          to={`/properties/${p.id}/edit`}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-accent text-accent-foreground rounded-md hover:opacity-90 transition-opacity"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </Link>
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-destructive text-destructive-foreground rounded-md hover:opacity-90 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-foreground text-lg mb-2">Delete Property?</h3>
            <p className="text-sm text-muted-foreground mb-5">This will permanently delete this property. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={!!busy}
                className="flex-1 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {busy ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReview;
