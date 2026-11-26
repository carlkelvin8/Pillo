import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IntegrationsOverview } from "./integrations-overview";

describe("IntegrationsOverview", () => {
  it("shows setup status, tool permissions, and an honest empty activity state", () => {
    render(
      <IntegrationsOverview
        endpoint="https://clinic.example/api/mcp"
        databaseConfigured={false}
        activity={[]}
        timezone="Asia/Manila"
      />,
    );

    expect(screen.getByText("Database connection needed")).toBeInTheDocument();
    expect(screen.getByText("https://clinic.example/api/mcp")).toBeInTheDocument();
    expect(screen.getByText("get_patient_summary")).toBeInTheDocument();
    expect(screen.getByText("No MCP activity yet.")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy URL" }).className).toContain("bg-surface");
  });

  it("renders recent tool calls without identifying patients", () => {
    render(
      <IntegrationsOverview
        endpoint="https://clinic.example/api/mcp"
        databaseConfigured
        activity={[
          {
            at: "2026-11-25T02:41:00.000Z",
            label: "request_payment",
            detail: "Completed",
            severity: "normal",
          },
        ]}
        timezone="Asia/Manila"
      />,
    );

    expect(screen.getAllByText("request_payment")).toHaveLength(2);
    expect(screen.getByText(/^Completed/)).toBeInTheDocument();
  });
});
