import type { MetadataRoute } from "next";
import { POSTS } from "@/lib/site/blog";
import { absoluteUrl } from "@/lib/site/config";
import { DOCS } from "@/lib/site/docs";
import { FEATURES } from "@/lib/site/features";
import { LEGAL } from "@/lib/site/legal";
import { SOLUTIONS } from "@/lib/site/solutions";

const UPDATED = new Date("2026-09-20T00:00:00Z");

export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly", lastModified: Date = UPDATED) => ({ url: absoluteUrl(path), lastModified, changeFrequency, priority });
  return [
    entry("/", 1, "weekly"),
    entry("/pricing", 0.9, "monthly"),
    entry("/features", 0.9, "monthly"),
    ...FEATURES.map((f) => entry(`/features/${f.slug}`, 0.8, "monthly")),
    entry("/solutions", 0.8, "monthly"),
    ...SOLUTIONS.map((s) => entry(`/solutions/${s.slug}`, 0.7, "monthly")),
    entry("/blog", 0.8, "weekly"),
    ...POSTS.map((p) => entry(`/blog/${p.slug}`, 0.7, "monthly", new Date(p.modified ?? p.published))),
    entry("/docs", 0.7, "monthly"),
    ...DOCS.map((d) => entry(`/docs/${d.slug}`, 0.6, "monthly")),
    entry("/help", 0.6, "monthly"),
    entry("/changelog", 0.5, "weekly"),
    entry("/about", 0.6, "yearly"),
    entry("/contact", 0.6, "yearly"),
    entry("/careers", 0.4, "yearly"),
    entry("/partners", 0.5, "yearly"),
    entry("/status", 0.3, "weekly"),
    entry("/login", 0.3, "yearly"),
    entry("/signup", 0.6, "yearly"),
    ...LEGAL.map((l) => entry(`/${l.slug}`, 0.3, "yearly")),
  ];
}
