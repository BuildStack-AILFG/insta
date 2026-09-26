import type { ComponentType, CSSProperties } from "react";
import { Target, Headphones, ShoppingBag } from "lucide-react";

export type TrainingResourceKind = "website" | "documents" | "qualification_fields" | "catalog";

export type TrainingResource = {
  kind: TrainingResourceKind;
  label: string;
};

export type AiAgentPersona = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: ComponentType<{ className?: string; size?: number; style?: CSSProperties }>;
  accentColor: string;
  trainingResources: TrainingResource[];
  enabled: boolean;
};

export const AI_AGENT_PERSONAS: AiAgentPersona[] = [
  {
    id: "leads",
    name: "Leads Agent",
    tagline: "Qualify inbound leads automatically",
    description:
      "Asks the right questions to identify serious buyers and captures the details your sales team needs before a human ever joins the chat.",
    icon: Target,
    accentColor: "#2563EB",
    trainingResources: [
      { kind: "website", label: "Website URL" },
      { kind: "documents", label: "Documents" },
      { kind: "qualification_fields", label: "Qualification Fields" },
    ],
    enabled: false,
  },
  {
    id: "support",
    name: "Support Agent",
    tagline: "Answer questions from your knowledge base",
    description:
      "Trained on your docs and site content to answer common questions instantly and accurately, day or night.",
    icon: Headphones,
    accentColor: "#0F9D58",
    trainingResources: [
      { kind: "website", label: "Website URL" },
      { kind: "documents", label: "Documents" },
    ],
    enabled: false,
  },
  {
    id: "sales",
    name: "Sales Agent",
    tagline: "Guide customers toward a purchase",
    description:
      "Recommends products from your catalog and helps contacts make a buying decision in the same chat thread.",
    icon: ShoppingBag,
    accentColor: "#D97706",
    trainingResources: [
      { kind: "website", label: "Website URL" },
      { kind: "documents", label: "Documents" },
      { kind: "catalog", label: "Product Catalog" },
    ],
    enabled: false,
  },
];
