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
        pageSize={1}
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
        pageSize={20}
      />,
    );
    expect(screen.getByText("Needs a human")).toBeInTheDocument();
    rerender(
      <ConversationList
        initialItems={[item("a", "resolved"), item("b", "open")]}
        initialTotal={2}
        filter="all"
        pageSize={20}
      />,
    );
    expect(screen.queryByText("Needs a human")).toBeNull();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    // Dropped from a filtered first page: the row disappears instead of lingering.
    rerender(
      <ConversationList
        initialItems={[item("b", "open")]}
        initialTotal={1}
        filter="needs"
        pageSize={20}
      />,
    );
    expect(screen.queryByText("Chat a")).toBeNull();
  });

  it("keeps a row pushed off the first page by a new conversation, without duplicates", async () => {
    const item = (id: string) => ({
      id,
      status: "open" as const,
      handledBy: "ai" as const,
      label: `Chat ${id}`,
      time: "9:00 AM",
      preview: "hello",
    });
    mock.loadMore.mockResolvedValueOnce({ items: [item("c"), item("d")], total: 5, hasMore: true });
    const { rerender } = render(
      <ConversationList
        initialItems={[item("a"), item("b")]}
        initialTotal={5}
        filter="all"
        pageSize={2}
      />,
    );
    await act(async () => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(mock.loadMore).toHaveBeenLastCalledWith(2, "all");
    expect(await screen.findByText("Chat d")).toBeInTheDocument();

    // A new conversation arrives: "b" is pushed off page 1 but must stay in the list.
    rerender(
      <ConversationList
        initialItems={[item("n"), item("a")]}
        initialTotal={6}
        filter="all"
        pageSize={2}
      />,
    );
    const labels = screen
      .getAllByRole("link")
      .map((link) => link.textContent?.match(/Chat (\w)/)?.[1]);
    expect(labels).toEqual(["n", "a", "b", "c", "d"]);

    // Next load continues from the distinct loaded rows (5 rows, page size 2 -> page 3).
    mock.loadMore.mockResolvedValueOnce({
      items: [item("d"), item("e")],
      total: 6,
      hasMore: false,
    });
    await act(async () => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(mock.loadMore).toHaveBeenLastCalledWith(3, "all");
    expect(await screen.findByText("Chat e")).toBeInTheDocument();
    expect(screen.getAllByText("Chat d")).toHaveLength(1);
  });
});
