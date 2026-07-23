import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GripVertical, ArrowUp, ArrowDown, Save, Loader2, RotateCcw, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "../components/ui/sonner";
import { fetchTherapists, saveOrder } from "../lib/kioskApi";
import { getInitials } from "./TherapistCard";

export default function AdminOrder() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dragIndex = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchTherapists(false);
      setList(data.therapists || []);
      setDirty(false);
    } catch (e) {
      toast.error("Could not load therapists.");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const move = (from, to) => {
    if (to < 0 || to >= list.length) return;
    setList((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  };

  const onDrop = () => {
    dragIndex.current = null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveOrder(list.map((t) => t.slug));
      setDirty(false);
      toast.success("Order saved. The kiosk will use this order on its next load or refresh.");
    } catch (e) {
      toast.error("Could not save order. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-brand-cream px-6 py-10 text-brand-ink sm:px-10">
      <Toaster position="top-center" richColors />
      <div className="mx-auto w-full max-w-2xl" data-testid="admin-page">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-green">
            Operator · Kiosk Setup
          </p>
          <Link
            to="/"
            data-testid="admin-view-kiosk-link"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-muted transition-colors hover:text-brand-green"
          >
            View kiosk <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <h1 className="font-serif text-3xl leading-tight text-brand-ink sm:text-4xl">
          Arrange therapists
        </h1>
        <p className="mt-2 max-w-xl text-base text-brand-muted">
          Drag the cards (or use the arrows) to set the order they appear on the check-in kiosk.
          This affects only the kiosk display order — clients can't rearrange anything.
        </p>

        {loading ? (
          <div className="mt-16 flex flex-col items-center text-brand-muted">
            <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
            <p className="mt-3">Loading therapists…</p>
          </div>
        ) : (
          <>
            <ul className="mt-8 space-y-3" data-testid="admin-order-list">
              {list.map((t, i) => (
                <li
                  key={t.slug}
                  data-testid={`admin-row-${t.slug}`}
                  draggable
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex.current === null || dragIndex.current === i) return;
                    move(dragIndex.current, i);
                    dragIndex.current = i;
                  }}
                  onDrop={onDrop}
                  onDragEnd={onDrop}
                  className="flex cursor-grab items-center gap-4 rounded-lg border-[1.5px] border-brand-line bg-white p-3 shadow-sm transition-shadow active:cursor-grabbing active:shadow-md"
                >
                  <GripVertical className="h-5 w-5 shrink-0 text-brand-line" />
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cream-deep text-sm font-semibold text-brand-muted">
                    {i + 1}
                  </span>
                  <Thumb therapist={t} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-lg text-brand-ink">{t.name}</p>
                    <p className="truncate text-sm text-brand-muted">
                      {t.practice || t.credentials || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      data-testid={`admin-move-up-${t.slug}`}
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                      className="rounded-md border border-brand-line p-1 text-brand-muted transition-colors hover:border-brand-green hover:text-brand-green disabled:opacity-30"
                      aria-label={`Move ${t.name} up`}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      data-testid={`admin-move-down-${t.slug}`}
                      onClick={() => move(i, i + 1)}
                      disabled={i === list.length - 1}
                      className="rounded-md border border-brand-line p-1 text-brand-muted transition-colors hover:border-brand-green hover:text-brand-green disabled:opacity-30"
                      aria-label={`Move ${t.name} down`}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-center gap-3">
              <button
                data-testid="admin-save-order-button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-green px-6 py-3 text-base font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-green-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {saving ? "Saving…" : dirty ? "Save order" : "Saved"}
              </button>
              <button
                data-testid="admin-reset-button"
                onClick={load}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-brand-line bg-white px-5 py-3 text-base font-medium text-brand-muted transition-colors hover:bg-brand-cream disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Thumb({ therapist }) {
  const [err, setErr] = useState(false);
  const isLogo = therapist.photo && therapist.photo.includes("/images/practices/");
  if (err || !therapist.photo) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-green text-sm font-semibold text-white">
        {getInitials(therapist.name)}
      </span>
    );
  }
  return (
    <img
      src={therapist.photo}
      alt={therapist.name}
      onError={() => setErr(true)}
      referrerPolicy="no-referrer"
      className={
        isLogo
          ? "h-12 w-12 shrink-0 rounded-md bg-white object-contain p-1"
          : "h-12 w-12 shrink-0 rounded-md object-cover"
      }
    />
  );
}
