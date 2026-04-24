"use client";

import { toggleCompare } from "@/components/Compare";

/**
 * "X" button in the corner of a compare card. Clicking it removes the
 * slug from the compare list AND updates the URL so the server page
 * re-renders with the new slugs list — no full refresh needed, Next.js
 * handles the navigation.
 */
export function CompareRemoveButton({
  slug,
  allSlugs,
}: {
  slug: string;
  allSlugs: string[];
}) {
  const remaining = allSlugs.filter((s) => s !== slug);
  const nextHref =
    remaining.length === 0
      ? "/comparar"
      : `/comparar?slugs=${encodeURIComponent(remaining.join(","))}`;

  return (
    <a
      href={nextHref}
      aria-label="Quitar de comparar"
      title="Quitar de comparar"
      onClick={() => {
        // Also sync the localStorage list so the floating button + /vino
        // badge update without waiting for the server navigation.
        toggleCompare(slug);
      }}
      className="absolute top-3 right-3 cursor-wine w-8 h-8 rounded-full bg-ink/5 hover:bg-ink/15 text-ink inline-flex items-center justify-center transition"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </a>
  );
}
