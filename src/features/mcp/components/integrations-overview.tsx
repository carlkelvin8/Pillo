import { ArrowUpRight, Check, CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { dateOf, formatDateShort, formatTime } from "@/lib/datetime";
import type { McpActivityItem } from "../activity";
import { MCP_SCOPE_CATALOG, MCP_TOOL_CATALOG } from "../catalog";
import { CopyEndpointButton } from "./copy-endpoint-button";

function EndpointCopy({ endpoint }: { endpoint: string }) {
  return <div className="flex flex-col gap-2 sm:flex-row">
    <code className="min-w-0 flex-1 overflow-x-auto rounded-control border border-line-strong bg-surface px-4 py-3 font-mono text-sm text-ink" aria-label="MCP endpoint URL">
      {endpoint}
    </code>
    <CopyEndpointButton endpoint={endpoint} />
  </div>;
}

export function IntegrationsOverview({
  endpoint,
  databaseConfigured,
  activity,
  timezone,
  activityUnavailable = false,
}: {
  endpoint: string;
  databaseConfigured: boolean;
  activity: McpActivityItem[];
  timezone: string;
  activityUnavailable?: boolean;
}) {
  return <div className="flex flex-col gap-6">
    <Card variant="hero" className="flex flex-col gap-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-mint text-mint-ink"><ShieldCheck aria-hidden="true" /></span>
          <div>
            <p className="text-sm text-surface/70">Model Context Protocol</p>
            <CardTitle className="mt-1 text-surface">MCP server</CardTitle>
            <p className="mt-2 max-w-2xl text-sm text-surface/80">Connect an MCP client to clinic data with scoped access. Write actions are limited, and payment requests wait for staff approval.</p>
          </div>
        </div>
        <Chip tone={databaseConfigured ? "success" : "pending"}>
          {databaseConfigured ? "Ready to connect" : "Database connection needed"}
        </Chip>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-surface/80">Endpoint URL</p>
        <div id="mcp-endpoint"><EndpointCopy endpoint={endpoint} /></div>
      </div>
      {!databaseConfigured ? <p className="flex items-start gap-2 text-sm text-surface/80">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Configure the server-only DATABASE_URL before MCP clients can connect. Keep database credentials out of browser code.
      </p> : null}
      <a href="https://modelcontextprotocol.io/docs/develop/build-server" target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-surface underline decoration-surface/40 underline-offset-4 hover:decoration-surface">
        MCP protocol guide <ArrowUpRight aria-hidden="true" className="size-4" />
      </a>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <Card className="flex flex-col gap-5">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-muted text-sm">Tools available to clients</p><CardTitle className="mt-1">Clinic capabilities</CardTitle></div>
          <Chip tone="neutral">{MCP_TOOL_CATALOG.length} tools</Chip>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {MCP_TOOL_CATALOG.map((tool) => <li key={tool.name} className="rounded-control border border-line bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="font-mono text-xs font-semibold text-ink">{tool.name}</code>
              <Chip tone={tool.access === "Approval required" ? "pending" : "neutral"}>{tool.access}</Chip>
            </div>
            <p className="mt-2 text-sm text-muted">{tool.description}</p>
            <p className="mt-3 text-xs text-muted">Requires {tool.scope}</p>
          </li>)}
        </ul>
      </Card>

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <div><p className="text-muted text-sm">Access control</p><CardTitle className="mt-1">Token permissions</CardTitle></div>
          <p className="text-sm text-muted">Choose scopes for each client token. Patient access is off unless you grant it.</p>
          <ul className="divide-y divide-line">
            {MCP_SCOPE_CATALOG.map((scope) => <li key={scope.scope} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div><p className="text-sm font-semibold">{scope.label}</p><p className="mt-1 text-xs text-muted">{scope.description}</p></div>
              <span aria-label="Configured per token" className="mt-1 size-3 shrink-0 rounded-full border-2 border-line-strong" />
            </li>)}
          </ul>
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3"><CardTitle>Recent MCP activity</CardTitle><Clock3 aria-hidden="true" className="size-5 text-muted" /></div>
          {activityUnavailable ? <p className="text-sm text-muted">MCP activity could not be loaded.</p> : activity.length === 0 ? <p className="text-sm text-muted">No MCP activity yet.</p> : <ol className="flex flex-col">
            {activity.map((item, index) => <li key={`${item.at}-${item.label}-${index}`} className="flex items-start gap-3 border-t border-line py-3 first:border-0 first:pt-0 last:pb-0">
              <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${item.severity === "normal" ? "bg-mint text-mint-ink" : item.severity === "warning" ? "bg-neutral-chip text-ink-2" : "bg-danger-chip text-danger-chip-ink"}`}>
                {item.severity === "normal" ? <Check aria-hidden="true" className="size-4" /> : item.severity === "warning" ? <Clock3 aria-hidden="true" className="size-4" /> : <CircleAlert aria-hidden="true" className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <span className={item.label.includes("_") ? "font-mono text-xs font-semibold" : "text-sm font-semibold"}>{item.label}</span>
                <p className="text-muted mt-1 text-xs">{item.detail} · {formatDateShort(dateOf(item.at, timezone))}, {formatTime(item.at, timezone)}</p>
              </div>
            </li>)}
          </ol>}
        </Card>
      </div>
    </div>
  </div>;
}
