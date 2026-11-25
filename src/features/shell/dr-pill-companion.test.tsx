import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrPillCompanion } from "./dr-pill-companion";

function dispatchPointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  point: { clientX: number; clientY: number },
) {
  const event = new Event(type, { bubbles: true }) as PointerEvent;
  Object.defineProperties(event, {
    clientX: { value: point.clientX },
    clientY: { value: point.clientY },
    pointerId: { value: 1 },
  });
  target.dispatchEvent(event);
}

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("DrPillCompanion", () => {
  it("renders a visibly floating mascot as the companion trigger", () => {
    render(<DrPillCompanion role="doctor" />);

    const trigger = screen.getByRole("button", { name: "Open Dr. Pill help" });
    expect(trigger.querySelector("svg")).toHaveClass("pill-companion-avatar");
    expect(trigger.querySelector("svg")).toHaveAttribute("width", "88");
    expect(trigger).toHaveClass("size-24", "bg-transparent");
    expect(trigger).not.toHaveTextContent("Need help?");
  });

  it("opens and closes the role-aware help panel", () => {
    render(<DrPillCompanion role="doctor" />);

    const toggle = screen.getByRole("button", { name: "Open Dr. Pill help" });
    fireEvent.click(toggle);
    expect(screen.getByRole("region", { name: "Dr. Pill help" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Appointments" })).toHaveAttribute(
      "href",
      "/appointments",
    );
    expect(screen.queryByRole("link", { name: "Ask Dr. Pill" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close Dr. Pill help" }));
    expect(screen.queryByRole("region", { name: "Dr. Pill help" })).toBeNull();
  });

  it("changes expression on hover and keeps animation controls automatic", () => {
    render(<DrPillCompanion role="owner" />);

    const trigger = screen.getByRole("button", { name: "Open Dr. Pill help" });
    fireEvent.pointerEnter(trigger);
    expect(trigger).toHaveAttribute("data-mood", "wink");
    fireEvent.pointerLeave(trigger);
    expect(trigger).toHaveAttribute("data-mood", "happy");

    fireEvent.click(trigger);
    expect(screen.getByRole("status")).toHaveTextContent("Ready to help");
    expect(screen.queryByRole("button", { name: /play .* animation/i })).toBeNull();
  });

  it("automatically alternates the stethoscope and syringe animations", () => {
    vi.useFakeTimers();
    render(<DrPillCompanion role="doctor" />);

    const trigger = screen.getByRole("button", { name: "Open Dr. Pill help" });
    expect(trigger).toHaveAttribute("data-care-animation", "idle");

    act(() => vi.advanceTimersByTime(4000));
    expect(trigger).toHaveAttribute("data-care-animation", "stethoscope");
    expect(trigger.querySelector(".pill-companion-stethoscope svg")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1500));
    expect(trigger).toHaveAttribute("data-care-animation", "syringe");
    expect(trigger.querySelector(".pill-companion-syringe svg")).toBeInTheDocument();
  });

  it("moves by keyboard and saves the pet position for other pages", () => {
    render(<DrPillCompanion role="doctor" />);

    const trigger = screen.getByRole("button", { name: "Open Dr. Pill help" });
    fireEvent.keyDown(trigger, { key: "ArrowLeft", shiftKey: true });

    const wrapper = trigger.parentElement;
    expect(wrapper).toHaveStyle({ left: `${window.innerWidth - 96 - 24 - 24}px` });
    expect(window.localStorage.getItem("pillo-dr-pill-companion-position")).toContain('"left"');
  });

  it("drags without opening help and persists the new location", () => {
    render(<DrPillCompanion role="doctor" />);

    const trigger = screen.getByRole("button", { name: "Open Dr. Pill help" });
    const wrapper = trigger.parentElement;
    const leftBefore = Number(wrapper?.style.left.replace("px", ""));
    const topBefore = Number(wrapper?.style.top.replace("px", ""));

    act(() => {
      dispatchPointer(trigger, "pointerdown", {
        clientX: leftBefore + 48,
        clientY: topBefore + 48,
      });
      dispatchPointer(trigger, "pointermove", {
        clientX: leftBefore - 32,
        clientY: topBefore + 8,
      });
      dispatchPointer(trigger, "pointerup", {
        clientX: leftBefore - 32,
        clientY: topBefore + 8,
      });
    });
    fireEvent.click(trigger);

    expect(wrapper).toHaveStyle({ left: `${leftBefore - 80}px`, top: `${topBefore - 40}px` });
    expect(window.localStorage.getItem("pillo-dr-pill-companion-position")).toContain(
      `"left":${leftBefore - 80}`,
    );
    expect(screen.queryByRole("region", { name: "Dr. Pill help" })).toBeNull();
  });

  it("shows Ask Dr. Pill only for staff managers", () => {
    render(<DrPillCompanion role="owner" />);

    fireEvent.click(screen.getByRole("button", { name: "Open Dr. Pill help" }));
    expect(screen.getByRole("link", { name: "Ask Dr. Pill" })).toHaveAttribute(
      "href",
      "/dr-pill/ask",
    );
  });
});
