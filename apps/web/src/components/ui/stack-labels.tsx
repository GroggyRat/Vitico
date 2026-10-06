"use client";

import { useEffect, useRef } from "react";

/**
 * On phones, tables are shown as stacked cards (see [data-stack] in globals.css). Each cell
 * shows its column name, which this copies from the header into a data-label attribute.
 */
export function StackLabels() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const table = ref.current?.parentElement?.querySelector("table");
    if (!table) return;
    const label = () => {
      const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
      for (const row of table.querySelectorAll("tbody tr")) {
        let col = 0;
        for (const cell of row.children) {
          if (!cell.hasAttribute("colspan") && heads[col]) cell.setAttribute("data-label", heads[col]);
          col += Number(cell.getAttribute("colspan") ?? 1);
        }
      }
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return <span ref={ref} hidden />;
}
