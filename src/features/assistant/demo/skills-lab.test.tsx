import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DrPillSkillsLab } from "./skills-lab";

describe("DrPillSkillsLab", () => {
  it("puts the conversation first and offers no more than three starter prompts", () => {
    render(<DrPillSkillsLab demoAvailable={false} />);

    expect(screen.getByRole("log", { name: "Dr. Pill conversation" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ask Dr. Pill a question")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^(Appointments|Recall|Medical question)$/ }),
    ).toHaveLength(3);
  });

  it("keeps packs, workflows and the Gemini FAQ collapsed under Explore skills", () => {
    render(<DrPillSkillsLab demoAvailable={false} />);

    const details = screen.getByText("Explore skills").closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Explore skills"));
    expect(within(details as HTMLElement).getByText("Choose a clinic pack")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("Gemini synthetic FAQ")).toBeInTheDocument();
  });

  it("does not use emoji as skill-pack icons", () => {
    const { container } = render(<DrPillSkillsLab demoAvailable={false} />);
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it("routes a vaccination visit-preparation question to the specialty intake checklist", () => {
    render(<DrPillSkillsLab demoAvailable={false} />);
    fireEvent.click(screen.getByText("Explore skills"));
    fireEvent.click(screen.getByRole("button", { name: /Veterinary/ }));

    fireEvent.change(screen.getByLabelText("Ask Dr. Pill a question"), {
      target: { value: "What should a fictional pet owner bring to a routine vaccination visit?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      screen.getByText(/bring any previous vaccination records if available/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/pet name and species, pet age, and visit reason/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/appointment request/i)).not.toBeInTheDocument();
  });

  it("does not turn unsupported free-text questions into appointment requests", () => {
    render(<DrPillSkillsLab demoAvailable={false} />);
    fireEvent.change(screen.getByLabelText("Ask Dr. Pill a question"), {
      target: { value: "What are the clinic hours?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      screen.getByText(
        /I can help with appointments, recalls, billing steps, or visit preparation/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/appointment request/i)).not.toBeInTheDocument();
  });
});
