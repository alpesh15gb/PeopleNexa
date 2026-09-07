"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render children into document.body.
 *
 * Required for viewport-fixed overlays (modals, capture sheets): page
 * wrappers use entrance animations whose fill mode leaves a persistent
 * transform (or backdrop-filter) on an ancestor, which would otherwise
 * become the containing block for `position: fixed` — trapping the overlay
 * inside the content box (backdrop dims only the page, dialog centers far
 * outside the viewport and appears "missing").
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
