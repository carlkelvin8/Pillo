/** Planned plans. Prices are placeholders until pricing is decided: never invent amounts here. */
export type PlannedPlan = {
  id: string;
  name: string;
  audience: string;
  price: string;
  includes: readonly string[];
};

export const CURRENT_PLAN = {
  name: "Free during early access",
  description: "Every feature that exists today is available to your clinic at no charge.",
} as const;

export const PLANNED_PLANS: readonly PlannedPlan[] = [
  {
    id: "starter",
    name: "Starter",
    audience: "For a single clinic getting organized.",
    price: "[YOUR PRICE]",
    includes: [
      "Appointments and patient records",
      "Invoices and payment records",
      "One branch",
    ],
  },
  {
    id: "clinic",
    name: "Clinic",
    audience: "For clinics with several staff or branches.",
    price: "[YOUR PRICE]",
    includes: [
      "Everything in Starter",
      "Multiple branches and doctors",
      "Staff roles and permissions",
      "Dr. Pill chair-filler offers",
    ],
  },
] as const;
