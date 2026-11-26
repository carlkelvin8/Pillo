import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ loadMore: vi.fn() }));
vi.mock("@/features/assistant/actions", () => ({
  loadMoreConversationsAction: mock.loadMore,
}));

import { ConversationList } from "./conversation-list";

let intersectionCallback: IntersectionObserverCallback | undefined;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "120px";
  readonly thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve() {}
}

describe("ConversationList", () => {
  beforeEach(() => {
    intersectionCallback = undefined;
    mock.loadMore.mockReset();
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
  });

  it("loads older conversations as the list is scrolled", async () => {
    mock.loadMore.mockResolvedValue({
      items: [
        {
          id: "older-conversation",
          status: "open",
          handledBy: "ai",
          label: "Older patient",
          time: "Yesterday",
          preview: "Can I book a visit?",
        },
      ],
      total: 2,
      hasMore: false,
    });

    render(
      <ConversationList
        initialItems={[
          {
            id: "recent-conversation",
            status: "open",
            handledBy: "ai",
            label: "Recent patient",
            time: "Today",
            preview: "Hello",
          },
        ]}
        initialTotal={2}
        filter="all"
      />,
    );

    await act(async () => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(mock.loadMore).toHaveBeenCalledWith(2, "all");
    expect(await screen.findByRole("link", { name: /Older patient/ })).toHaveAttribute(
      "href",
      "/dr-pill?c=older-conversation",
    );
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
  });

  it("replaces first-page rows on refresh so a resolved conversation does not keep a stale chip", () => {
    const item = (id: string, status: "open" | "needs_human" | "resolved") => ({
      id,
      status,
      handledBy: "ai" as const,
      label: `Chat ${id}`,
      time: "9:00 AM",
      preview: "hello",
    });
    const { rerender } = render(
      <ConversationList
        initialItems={[item("a", "needs_human"), item("b", "open")]}
        initialTotal={2}
        filter="all"
      />,
    );
    expect(screen.getByText("Needs a human")).toBeInTheDocument();
    rerender(
      <ConversationList
        initialItems={[item("a", "resolved"), item("b", "open")]}
        initialTotal={2}
        filter="all"
      />,
    );
    expect(screen.queryByText("Needs a human")).toBeNull();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    // Dropped from a filtered first page: the row disappears instead of lingering.
    rerender(
      <ConversationList initialItems={[item("b", "open")]} initialTotal={1} filter="needs" />,
    );
    expect(screen.queryByText("Chat a")).toBeNull();
  });
});
