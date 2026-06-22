import { TestIds } from "../lib/testIds";

export function TherapistCard({ therapist, onSelect, index }) {
  const { slug, name, credentials, photo } = therapist;
  const isLogo = typeof photo === "string" && photo.includes("/images/practices/");
  // Per-therapist framing tweaks (where the crop should focus). Default centers.
  const objectPosition = { "rich-maier": "center 18%" }[slug] || "center";
  return (
    <button
      data-testid={TestIds.card(slug)}
      onClick={() => onSelect(therapist)}
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
      className="group animate-fade-up flex h-full min-h-0 flex-col overflow-hidden rounded-lg border-[1.5px] border-brand-line bg-white text-left shadow-[0_4px_18px_rgba(34,48,42,0.06)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-brand-green hover:shadow-[0_14px_34px_rgba(46,93,58,0.18)] active:translate-y-0 active:scale-[0.985] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-green/40"
    >
      <div className="min-h-0 w-full flex-1 overflow-hidden bg-brand-cream-deep">
        <img
          src={photo}
          alt={name}
          draggable={false}
          loading="eager"
          referrerPolicy="no-referrer"
          style={isLogo ? undefined : { objectPosition }}
          className={
            isLogo
              ? "h-full w-full bg-white object-contain p-6 transition-transform duration-500 ease-out group-hover:scale-105"
              : "h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          }
        />
      </div>
      <div className="flex shrink-0 flex-col justify-center px-5 py-3">
        <span className="font-serif text-[1.4rem] leading-tight text-brand-ink">
          {name}
        </span>
        {credentials ? (
          <span className="mt-0.5 text-sm font-medium uppercase tracking-wide text-brand-green">
            {credentials}
          </span>
        ) : null}
      </div>
    </button>
  );
}
