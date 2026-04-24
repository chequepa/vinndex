"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Suggestion = {
  groupSlug: string;
  canonicalName: string;
  brand: string | null;
  vintage: number | null;
  imageUrl: string | null;
  minPrice: number | null;
  minPriceFormatted: string | null;
  storeCount: number;
};

type Props = {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  name?: string;
  autoFocus?: boolean;
  withAutocomplete?: boolean;
  "aria-label"?: string;
};

/**
 * Search input with optional autocomplete dropdown. Default usage is
 * uncontrolled — the `<form>` submit navigates to /buscar?q=... The
 * autocomplete is opt-in (withAutocomplete) and adds a debounced fetch
 * to /api/search with keyboard nav (arrows, enter, escape) + click.
 *
 * Non-autocomplete usage (most forms) stays identical to the previous
 * API: defaultValue + onFocus select-all behavior.
 */
export function SearchInput({
  defaultValue,
  placeholder,
  className,
  name = "q",
  autoFocus,
  withAutocomplete,
  ...rest
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(-1);

  useEffect(() => {
    if (!withAutocomplete) return;
    const q = value.trim();
    if (q.length < 2) return; // UI gate handles the hide — no setState needed
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { groups: [] }))
        .then((data: { groups: Suggestion[] }) => {
          setSuggestions(data.groups);
          setOpen(data.groups.length > 0);
          setSelected(-1);
        })
        .catch(() => {
          /* aborted or network — silent */
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, withAutocomplete]);

  const showDropdown =
    withAutocomplete &&
    open &&
    value.trim().length >= 2 &&
    suggestions.length > 0;

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!withAutocomplete || !open || suggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => (i + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) =>
          i <= 0 ? suggestions.length - 1 : i - 1,
        );
      } else if (e.key === "Enter" && selected >= 0) {
        const chosen = suggestions[selected];
        if (chosen) {
          e.preventDefault();
          window.location.href = `/vino/${chosen.groupSlug}`;
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        ref.current?.blur();
      }
    },
    [withAutocomplete, open, suggestions, selected],
  );

  return (
    <>
      <input
        ref={ref}
        type="text"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        onFocus={(e) => {
          e.currentTarget.select();
          if (withAutocomplete && suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // Delay so click on a suggestion (mousedown → click) fires
          // before we close the dropdown.
          setTimeout(() => setOpen(false), 150);
        }}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
        autoComplete="off"
        {...rest}
      />
      {showDropdown && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-ink/10 overflow-hidden z-40 max-h-[70vh] overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li key={s.groupSlug} role="option" aria-selected={i === selected}>
              <a
                href={`/vino/${s.groupSlug}`}
                onMouseDown={(e) => {
                  // Prevent the input from losing focus before the
                  // click handler runs.
                  e.preventDefault();
                }}
                className={`flex items-center gap-3 px-4 py-3 text-left cursor-wine no-underline ${
                  i === selected ? "bg-snow" : "hover:bg-snow"
                }`}
              >
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.imageUrl}
                    alt=""
                    className="w-8 h-12 object-contain shrink-0"
                  />
                ) : (
                  <div className="w-8 h-12 bg-snow border border-ink/10 rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {s.canonicalName}
                    {s.vintage ? (
                      <span className="text-graphite font-normal"> · {s.vintage}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-graphite truncate">
                    {s.brand ?? "—"}
                    {" · "}
                    {s.storeCount} {s.storeCount === 1 ? "vinoteca" : "vinotecas"}
                  </p>
                </div>
                {s.minPriceFormatted && (
                  <span className="text-sm font-semibold text-ink shrink-0">
                    {s.minPriceFormatted}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
