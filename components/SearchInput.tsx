"use client";

import { useRef } from "react";

type Props = {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  name?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
};

export function SearchInput({
  defaultValue,
  placeholder,
  className,
  name = "q",
  autoFocus,
  ...rest
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <input
      ref={ref}
      type="text"
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
      onFocus={(e) => e.currentTarget.select()}
      {...rest}
    />
  );
}
