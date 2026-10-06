import { twMerge } from "tailwind-merge";

/** Joins class names; later Tailwind classes override conflicting earlier ones (e.g. w-36 beats w-full). */
export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(" "));
}
