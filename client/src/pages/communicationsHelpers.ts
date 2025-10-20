import { type PostmarkTemplateType } from "@shared/postmarkTemplates";

export type SummaryBlock = "account" | "cta";

export const DEFAULT_SUMMARY_ORDER: SummaryBlock[] = ["account", "cta"];
export const SECTION_ORDER_REGEX = /<!--SECTION_ORDER:([a-z,]+)-->/i;

export const createDefaultAccountDetails = () => [
  { label: "Account:", value: "{{accountNumber}}" },
  { label: "File #:", value: "{{filenumber}}" },
  { label: "Creditor:", value: "{{creditor}}" },
  { label: "Balance:", value: "{{balance}}" },
  { label: "Due Date:", value: "{{dueDate}}" }
] as { label: string; value: string }[];

export const getAccountHeading = (designType: PostmarkTemplateType) => {
  switch (designType) {
    case "postmark-welcome":
      return "<p>Your account details:</p>";
    case "postmark-access":
      return "<p>Your account information:</p>";
    default:
      return "";
  }
};

export const stripSectionOrderComment = (html: string) => html.replace(SECTION_ORDER_REGEX, "");

export const extractSectionOrder = (html: string): SummaryBlock[] => {
  const match = html.match(SECTION_ORDER_REGEX);
  if (!match?.[1]) return [];
  const parts = match[1]
    .split(",")
    .map(part => part.trim())
    .filter((part): part is SummaryBlock => part === "account" || part === "cta");
  return Array.from(new Set(parts));
};

export const normalizeSummaryOrder = (
  order: SummaryBlock[] | undefined,
  options: { includeAccount: boolean; includeCta: boolean }
): SummaryBlock[] => {
  const base = order && order.length > 0 ? order : DEFAULT_SUMMARY_ORDER;
  const unique: SummaryBlock[] = [];
  base.forEach(block => {
    if (!unique.includes(block)) {
      unique.push(block);
    }
  });
  if (options.includeAccount && !unique.includes("account")) {
    unique.unshift("account");
  }
  if (options.includeCta && !unique.includes("cta")) {
    unique.push("cta");
  }
  return unique.filter(block =>
    (block === "account" && options.includeAccount) ||
    (block === "cta" && options.includeCta)
  );
};
