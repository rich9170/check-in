import { useState } from "react";
import { TestIds } from "../lib/testIds";

export function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function TherapistCard({ therapist, onSelect, index }) {
  const { slug, name, credentials, practice, photo } = therapist;
  const [imgError, setImgError] = useState(false);
  const isLogo = typeof photo === "string" && photo.includes("/images/practices/");
  // Per-therapist framing tweaks (where the crop should focus). Default centers.
  const objectPosition = { "rich-maier": "center 18%", "cristina-dunahoo": "center 18%", "steph-maier": "center 34%", "shari-almanza": "center 10%" }[slug] || "center";
  return (
    <button
      data-testid={TestIds.card(slug)}
      onClick={() => onSelect(therapist)}
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
      className="group animate-fade-up flex h-full min-h-0 flex-col overflow-hidden rounded-lg border-[1.5px] border-brand-line bg-white text-left shadow-[0_4px_18px_rgba(34,48,42,0.06)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-brand-green hover:shadow-[0_14px_34px_rgba(46,93,58,0.18)] active:translate-y-0 active:scale-[0.985] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-green/40"
    >
      <div className="min-h-0 w-full flex-1 overflow-hidden bg-brand-cream-deep">
        {imgError || !photo ? (
          <div className="flex h-full w-full items-center justify-center bg-brand-green">
            <span className="font-serif text-6xl font-semibold tracking-wide text-white sm:text-7xl">
              {getInitials(name)}
            </span>
          </div>
        ) : (
          <img
            src={photo}
            alt={name}
            draggable={false}
            loading="eager"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            style={isLogo ? undefined : { objectPosition }}
            className={
              isLogo
                ? "h-full w-full bg-white object-contain p-6 transition-transform duration-500 ease-out group-hover:scale-105"
                : "h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            }
          />
        )}
      </div>
      <div className="shrink-0 px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-[1.3rem] leading-none text-brand-ink">
            {name}
          </span>
          {credentials ? (
            <span className="text-sm font-medium text-brand-green">
              {credentials}
            </span>
          ) : null}
        </div>
        {practice ? (
          <span className="mt-1 block truncate text-xs font-medium text-brand-muted">
            {practice}
          </span>
        ) : null}
      </div>
    </button>
  );
}
