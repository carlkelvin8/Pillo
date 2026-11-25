import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DrPillAvatar, type DrPillMood } from "./dr-pill-avatar";

const moods: DrPillMood[] = ["happy", "wink", "think", "sleepy"];

describe("DrPillAvatar", () => {
  it.each(moods)("renders the %s mood with an accessible name", (mood) => {
    render(<DrPillAvatar mood={mood} />);
    expect(
      screen.getByRole("img", {
        name: new RegExp(
          `Dr\\. Pill, ${mood === "happy" ? "smiling" : mood === "wink" ? "winking" : mood === "think" ? "thinking" : "sleepy"}`,
        ),
      }),
    ).toBeInTheDocument();
  });

  it("is hidden from assistive tech when decorative", () => {
    const { container } = render(<DrPillAvatar decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
