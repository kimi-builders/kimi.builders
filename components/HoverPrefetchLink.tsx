"use client";

/* Intent-prefetch link: skip automatic viewport prefetch, then restore the
   App Router default once a pointer or keyboard focus signals likely
   navigation. */
import Link from "next/link";
import { useState, type ComponentProps } from "react";

type HoverPrefetchLinkProps = Omit<
  ComponentProps<typeof Link>,
  "prefetch" | "onMouseEnter" | "onFocus"
>;

export default function HoverPrefetchLink(props: HoverPrefetchLinkProps) {
  const [active, setActive] = useState(false);
  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={() => setActive(true)}
      onFocus={() => setActive(true)}
    />
  );
}
