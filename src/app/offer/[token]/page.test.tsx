import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferView } from "@/features/chair-filler/accept";

const mock = vi.hoisted(() => ({ view: vi.fn() }));
vi.mock("@/lib/env-server", () => ({ serverEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: "key" }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/features/chair-filler/accept", () => ({ viewOffer: mock.view }));
vi.mock("./actions", () => ({ acceptOfferAction: vi.fn(), declineOfferAction: vi.fn() }));

import OfferPage from "./page";

async function show(view: OfferView, r?: string) {
  mock.view.mockResolvedValue(view);
  render(
    await OfferPage({
      params: Promise.resolve({ token: "token" }),
      searchParams: Promise.resolve(r ? { r } : {}),
    }),
  );
}

describe("OfferPage ?r= hints", () => {
  beforeEach(() => mock.view.mockReset());

  it("shows 'taken' when the offer was closed as expired by the accept flow", async () => {
    await show({ state: "closed", clinicName: "Clinic", status: "expired" }, "taken");
    expect(screen.getByRole("heading", { name: /kinuha na ang slot/ })).toBeInTheDocument();
  });

  it("does not show 'taken' for an offer that merely timed out", async () => {
    await show({ state: "expired", clinicName: "Clinic", status: "sent" }, "taken");
    expect(screen.queryByRole("heading", { name: /kinuha na ang slot/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "This offer has expired" })).toBeInTheDocument();
  });

  it("ignores 'taken' for an invalid token", async () => {
    await show({ state: "invalid" }, "taken");
    expect(
      screen.getByRole("heading", { name: "This offer is no longer available" }),
    ).toBeInTheDocument();
  });

  it("shows 'declined' only for a declined offer", async () => {
    await show({ state: "closed", clinicName: "Clinic", status: "declined" }, "declined");
    expect(screen.getByRole("heading", { name: "Okay po, salamat!" })).toBeInTheDocument();
  });
});
