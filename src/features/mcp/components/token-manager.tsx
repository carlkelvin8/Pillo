"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { createMcpTokenAction, revokeMcpTokenAction } from "../actions";
import { formatDateShort, dateOf } from "@/lib/datetime";
import { MCP_SCOPE_CATALOG } from "../catalog";
import { MCP_EXPIRY_DAYS, tokenState } from "../expiry";
import { Select } from "@/components/ui/input";

type Token = {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string;
};

function CreateToken() {
  const [state, action] = useActionState<ActionState, FormData>(createMcpTokenAction, {});
  const [copied, setCopied] = useState(false);
  const token = state.data?.token;
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <CardTitle>Create a client token</CardTitle>
        <p className="text-muted mt-1 text-sm">
          New tokens start with no permissions. Select only what this client needs.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Token name">
          <Input
            name="name"
            required
            maxLength={80}
            placeholder="e.g. Clinic reporting assistant"
          />
        </Field>
        <Field
          label="Expires"
          hint="Pick the shortest period that works. An expired token stops working and must be replaced."
        >
          <Select name="expiresInDays" defaultValue="90">
            {MCP_EXPIRY_DAYS.map((days) => (
              <option key={days} value={days}>
                {days === 365 ? "1 year" : `${days} days`}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Permissions</legend>
          {MCP_SCOPE_CATALOG.map((scope) => (
            <label key={scope.scope} className="flex min-h-11 items-start gap-3 py-2 text-sm">
              <input
                type="checkbox"
                name="scopes"
                value={scope.scope}
                className="accent-ink mt-0.5 size-5 shrink-0"
              />
              <span className="flex flex-col">
                <span>{scope.label}</span>
                <span className="text-muted text-xs">{scope.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Creating…">Create token</SubmitButton>
      </form>
      {token ? (
        <div className="bg-subtle rounded-control flex flex-col gap-3 p-4">
          <p className="text-sm font-semibold">
            Copy this token now. It cannot be recovered later.
          </p>
          <Input
            aria-label="New MCP bearer token"
            readOnly
            value={token}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(token);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy token"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Revoke({ tokenId }: { tokenId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(revokeMcpTokenAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="tokenId" value={tokenId} />
      <SubmitButton variant="danger" pendingLabel="Revoking…">
        Revoke
      </SubmitButton>
      {state.message ? (
        <span role={state.ok ? "status" : "alert"} className="text-sm">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function TokenManager({ tokens, timezone }: { tokens: Token[]; timezone: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.35fr]">
      <CreateToken />
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-muted text-sm">Access keys</p>
          <CardTitle className="mt-1">Client tokens</CardTitle>
        </div>
        {tokens.length === 0 ? (
          <div className="rounded-control bg-canvas p-5">
            <p className="font-semibold">No client tokens yet</p>
            <p className="text-muted mt-1 text-sm">
              Create a token for an MCP client, then copy it once. The secret is never stored in
              readable form.
            </p>
          </div>
        ) : (
          <ul className="divide-line divide-y">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{token.name}</p>
                  <p className="text-muted mt-1 text-sm">
                    {token.scopes.length
                      ? token.scopes
                          .map(
                            (scope) =>
                              MCP_SCOPE_CATALOG.find((item) => item.scope === scope)?.label ??
                              scope,
                          )
                          .join(" · ")
                      : "No scopes granted"}
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    Created {formatDateShort(dateOf(token.created_at, timezone))}
                    {` · ${tokenState(token) === "expired" ? "Expired" : "Expires"} ${formatDateShort(dateOf(token.expires_at, timezone))}`}
                    {token.last_used_at
                      ? ` · Last used ${formatDateShort(dateOf(token.last_used_at, timezone))}`
                      : " · Not used yet"}
                  </p>
                </div>
                {tokenState(token) === "revoked" ? (
                  <span className="text-muted text-sm">Revoked</span>
                ) : (
                  <>
                    {tokenState(token) === "expired" ? (
                      <span className="bg-danger-chip text-danger-chip-ink rounded-full px-3 py-1 text-xs font-semibold">
                        Expired
                      </span>
                    ) : null}
                    <Revoke tokenId={token.id} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
