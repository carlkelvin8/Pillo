import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  configured: vi.fn(),
  bySlug: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: mock.notFound }));
vi.mock("@/lib/env-server", () => ({ serverEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: "key" }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/features/assistant/components/chat-window", () => ({
  ChatWindow: ({ clinicName }: { clinicName: string }) => <p>Chat with {clinicName}</p>,
}));
vi.mock("@/features/assistant/chat-service", () => ({
  chatConfigured: mock.configured,
  getClinicBySlug: mock.bySlug,
  isClinicOpenNow: async () => true,
}));

import PublicChatPage from "./page";

const page = async (slug: string) => PublicChatPage({ params: Promise.resolve({ slug }) });

describe("PublicChatPage", () => {
  beforeEach(() => {
    mock.configured.mockReset();
    mock.bySlug.mockReset();
    mock.notFound.mockClear();
  });

  it("shows the same unavailable page for every slug while chat is disabled, without a lookup", async () => {
    mock.configured.mockReturnValue({ ok: false });
    render(await page("unknown-slug"));
    expect(screen.getByRole("heading", { name: /is not available yet/ })).toBeInTheDocument();
    expect(mock.bySlug).not.toHaveBeenCalled();
    expect(mock.notFound).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown slug when chat is enabled", async () => {
    mock.configured.mockReturnValue({ ok: true });
    mock.bySlug.mockResolvedValue(null);
    await expect(page("unknown-slug")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the chat for a known clinic when chat is enabled", async () => {
    mock.configured.mockReturnValue({ ok: true });
    mock.bySlug.mockResolvedValue({ id: "clinic", name: "Demo Clinic" });
    render(await page("demo"));
    expect(screen.getByText("Chat with Demo Clinic")).toBeInTheDocument();
  });
});
