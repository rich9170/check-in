import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { TherapistCard } from "./TherapistCard";
import { fetchTherapists, postCheckin } from "../lib/kioskApi";
import { TestIds } from "../lib/testIds";

const SUCCESS_RETURN_MS = 12000;
const ERROR_RETURN_MS = 12000;
const INACTIVITY_MS = 60000;
const LOGO_URL = "https://www.parkviewcounseling.org/images/logo.png";

export default function Kiosk() {
  const [screen, setScreen] = useState("loading"); // loading | home | init-error | confirm | sending | success | error
  const [therapists, setTherapists] = useState([]);
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const lastActivity = useRef(Date.now());
  const pressTimer = useRef(null);

  const goHome = useCallback(() => {
    setSelected(null);
    setScreen("home");
  }, []);

  const loadTherapists = useCallback(async (refresh = false) => {
    try {
      const data = await fetchTherapists(refresh);
      if (data?.therapists?.length) {
        setTherapists(data.therapists);
        setScreen((s) => (s === "loading" || s === "init-error" ? "home" : s));
        return true;
      }
      if (!therapists.length) setScreen("init-error");
      return false;
    } catch (e) {
      if (!therapists.length) setScreen("init-error");
      return false;
    }
  }, [therapists.length]);

  // Initial load
  useEffect(() => {
    loadTherapists(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kiosk guards: block context menu + pinch/gesture zoom
  useEffect(() => {
    const blockContext = (e) => e.preventDefault();
    const blockGesture = (e) => e.preventDefault();
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("gesturestart", blockGesture);
    return () => {
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("gesturestart", blockGesture);
    };
  }, []);

  // Hide the "Made with Emergent" badge (it has an inline !important style, so it
  // can only be overridden from JS). Re-hide if it gets re-injected.
  useEffect(() => {
    const hideBadge = () => {
      const el = document.getElementById("emergent-badge");
      if (el) el.style.setProperty("display", "none", "important");
    };
    hideBadge();
    const obs = new MutationObserver(hideBadge);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  // Activity tracking + inactivity reset for non-home screens
  useEffect(() => {
    const bump = () => (lastActivity.current = Date.now());
    window.addEventListener("pointerdown", bump);
    window.addEventListener("touchstart", bump);
    window.addEventListener("mousemove", bump);
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      setScreen((s) => {
        if (s !== "home" && s !== "loading" && s !== "init-error" && idle > INACTIVITY_MS) {
          setSelected(null);
          return "home";
        }
        return s;
      });
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("touchstart", bump);
      window.removeEventListener("mousemove", bump);
      clearInterval(interval);
    };
  }, []);

  // Auto-return after success / error
  useEffect(() => {
    if (screen !== "success" && screen !== "error") return;
    const ms = screen === "success" ? SUCCESS_RETURN_MS : ERROR_RETURN_MS;
    const t = setTimeout(goHome, ms);
    return () => clearTimeout(t);
  }, [screen, goHome]);

  const handleSelect = (therapist) => {
    setSelected(therapist);
    lastActivity.current = Date.now();
    setScreen("confirm");
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setScreen("sending");
    try {
      await postCheckin(selected.slug);
      setScreen("success");
    } catch (e) {
      setScreen("error");
    }
  };

  // Operator-only hidden gesture: long-press bottom-right corner to refresh roster
  const startPress = () => {
    pressTimer.current = setTimeout(async () => {
      setRefreshing(true);
      await loadTherapists(true);
      setTimeout(() => setRefreshing(false), 600);
    }, 700);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <div className="kiosk-root relative flex h-screen flex-col overflow-hidden bg-brand-cream text-brand-ink">
      {screen === "loading" && <LoadingScreen />}
      {screen === "init-error" && <InitErrorScreen onRetry={() => loadTherapists(true)} />}

      {screen !== "loading" && screen !== "init-error" && (
        <HomeScreen therapists={therapists} onSelect={handleSelect} />
      )}

      {screen === "confirm" && selected && (
        <ConfirmModal
          therapist={selected}
          onConfirm={handleConfirm}
          onCancel={goHome}
        />
      )}

      {screen === "sending" && <SendingScreen />}
      {screen === "success" && selected && (
        <SuccessScreen name={selected.name} onHome={goHome} />
      )}
      {screen === "error" && <ErrorScreen onHome={goHome} />}

      {/* Discreet operator refresh gesture (long-press ~0.7s) */}
      <button
        data-testid={TestIds.refreshCorner}
        aria-label="Refresh therapists"
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        className="fixed bottom-3 right-3 z-50 flex h-11 w-11 items-center justify-center rounded-full text-brand-line/70 transition-colors hover:text-brand-green"
      >
        <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ---------------------- Screens ---------------------- */

function HomeScreen({ therapists, onSelect }) {
  const count = therapists.length;
  // Landscape columns scale with roster size so 8 cards still fit one screen.
  const landscapeCols = count > 6 ? "landscape:grid-cols-4" : "landscape:grid-cols-3";
  return (
    <main
      data-testid={TestIds.homeScreen}
      className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-5 sm:px-10 sm:py-7"
    >
      <header className="mb-5 shrink-0 animate-fade-up sm:mb-6">
        <div className="mb-3 flex items-center gap-3">
          <img
            src={LOGO_URL}
            alt="Parkview Counseling logo"
            draggable={false}
            referrerPolicy="no-referrer"
            className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-green sm:text-sm">
            Parkview Counseling
          </p>
        </div>
        <h1 className="font-serif text-3xl leading-[1.05] text-brand-ink sm:text-4xl lg:text-5xl">
          Welcome to Parkview Counseling
          <span className="text-brand-green"> — Check In</span>
        </h1>
        <p className="mt-2 text-base text-brand-muted sm:text-lg">
          Tap your therapist to let them know you've arrived.
        </p>
      </header>

      <div
        data-testid={TestIds.therapistGrid}
        className={`grid min-h-0 flex-1 grid-cols-2 gap-4 sm:gap-5 ${landscapeCols} [grid-auto-rows:1fr]`}
      >
        {therapists.map((t, i) => (
          <TherapistCard key={t.slug} therapist={t} onSelect={onSelect} index={i} />
        ))}
      </div>
    </main>
  );
}

function ConfirmModal({ therapist, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-brand-ink/55 px-6 backdrop-blur-sm">
      <div
        data-testid={TestIds.confirmModal}
        className="w-full max-w-md animate-pop-in rounded-lg border-[1.5px] border-brand-line bg-white p-8 text-center shadow-2xl sm:p-10"
      >
        <div className="mx-auto mb-6 h-24 w-24 overflow-hidden rounded-full border-2 border-brand-green/30">
          <img
            src={therapist.photo}
            alt={therapist.name}
            draggable={false}
            referrerPolicy="no-referrer"
            style={
              therapist.photo && therapist.photo.includes("/images/practices/")
                ? undefined
                : { objectPosition: { "rich-maier": "center 18%", "cristina-dunahoo": "center 18%", "steph-maier": "center 34%", "shari-almanza": "center 18%" }[therapist.slug] || "center" }
            }
            className={
              typeof therapist.photo === "string" && therapist.photo.includes("/images/practices/")
                ? "h-full w-full bg-white object-contain p-2"
                : "h-full w-full object-cover"
            }
          />
        </div>
        <h2 className="font-serif text-3xl leading-tight text-brand-ink">
          Check in with {therapist.name}?
        </h2>
        {therapist.practice ? (
          <p className="mt-2 text-base text-brand-muted">{therapist.practice}</p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3">
          <button
            data-testid={TestIds.confirmButton}
            onClick={onConfirm}
            className="w-full rounded-lg bg-brand-green px-6 py-5 text-xl font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-green-dark active:scale-[0.98]"
          >
            Yes, Check Me In
          </button>
          <button
            data-testid={TestIds.cancelButton}
            onClick={onCancel}
            className="w-full rounded-lg border-[1.5px] border-brand-line bg-white px-6 py-4 text-lg font-medium text-brand-muted transition-colors hover:bg-brand-cream active:scale-[0.98]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SendingScreen() {
  return (
    <div
      data-testid={TestIds.sendingScreen}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-brand-cream/95 backdrop-blur-sm"
    >
      <Loader2 className="h-14 w-14 animate-spin text-brand-green" strokeWidth={1.75} />
      <p className="mt-6 font-serif text-2xl text-brand-ink">Notifying your therapist…</p>
    </div>
  );
}

function SuccessScreen({ name, onHome }) {
  return (
    <div
      data-testid={TestIds.successScreen}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-brand-cream px-8 text-center"
    >
      <div className="animate-pop-in">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <circle cx="60" cy="60" r="56" fill="#2E5D3A" fillOpacity="0.1" />
          <circle cx="60" cy="60" r="44" fill="#2E5D3A" />
          <path
            className="check-path"
            d="M42 61 L55 74 L80 47"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <h2 className="mt-8 max-w-2xl font-serif text-4xl leading-tight text-brand-ink sm:text-5xl">
        Thank you!
      </h2>
      <p className="mt-3 max-w-xl text-xl text-brand-muted">
        <span className="font-semibold text-brand-green">{name}</span> has been notified.
      </p>
      <button
        data-testid={TestIds.successHomeButton}
        onClick={onHome}
        className="mt-10 rounded-lg bg-brand-green px-10 py-5 text-xl font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-green-dark active:scale-[0.98]"
      >
        Check in Another Client
      </button>
      <p className="mt-6 text-sm text-brand-muted/80">Returning to home shortly…</p>
    </div>
  );
}

function ErrorScreen({ onHome }) {
  return (
    <div
      data-testid={TestIds.errorScreen}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-brand-cream px-8 text-center"
    >
      <div className="animate-pop-in flex h-24 w-24 items-center justify-center rounded-full border-2 border-brand-green/25 bg-white">
        <span className="font-serif text-5xl text-brand-green">!</span>
      </div>
      <h2 className="mt-8 font-serif text-4xl leading-tight text-brand-ink sm:text-5xl">
        Something went wrong.
      </h2>
      <p className="mt-4 max-w-lg text-xl text-brand-muted">
        Please send a message to your therapist through TherapyPortal to let them know you've arrived.
      </p>
      <button
        data-testid={TestIds.errorHomeButton}
        onClick={onHome}
        className="mt-10 rounded-lg bg-brand-green px-10 py-5 text-xl font-semibold text-white transition-[transform,background-color] duration-150 hover:bg-brand-green-dark active:scale-[0.98]"
      >
        Back to Home
      </button>
      <p className="mt-6 text-sm text-brand-muted/80">Returning to home shortly…</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div
      data-testid={TestIds.loadingScreen}
      className="flex min-h-screen flex-col items-center justify-center"
    >
      <Loader2 className="h-12 w-12 animate-spin text-brand-green" strokeWidth={1.75} />
      <p className="mt-5 font-serif text-2xl text-brand-ink">Preparing the kiosk…</p>
    </div>
  );
}

function InitErrorScreen({ onRetry }) {
  return (
    <div
      data-testid={TestIds.initErrorScreen}
      className="flex min-h-screen flex-col items-center justify-center px-8 text-center"
    >
      <h2 className="font-serif text-4xl leading-tight text-brand-ink sm:text-5xl">
        Kiosk is initializing
      </h2>
      <p className="mt-4 max-w-lg text-xl text-brand-muted">
        Please use the portal to check in.
      </p>
      <button
        data-testid={TestIds.retryButton}
        onClick={onRetry}
        className="mt-10 rounded-lg border-[1.5px] border-brand-green bg-white px-8 py-4 text-lg font-semibold text-brand-green transition-colors hover:bg-brand-green hover:text-white"
      >
        Try Again
      </button>
    </div>
  );
}
