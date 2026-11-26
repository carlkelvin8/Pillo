import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { dayBoundsUtc, isDateString } from "@/lib/datetime";
import { isOpenSlot, type HourWindow } from "@/features/scheduling/slots";
import { APP_NAME } from "@/config/brand";
import { onlinePaymentsEnabled } from "@/config/features";
import { withMcpClinic, type McpQueryDb } from "./database";
import type { McpAuth } from "./auth";
import { auditMcpCall } from "./audit";

const id = z.uuid();
const date = z.string().refine(isDateString);
const toText = (value: unknown) => JSON.stringify(value);

async function clinicTimezone(db: McpQueryDb, clinicId: string): Promise<string> {
  const [row] = await db.execute(sql`select timezone from public.clinics where id=${clinicId} limit 1`);
  if (!row || typeof row.timezone !== "string") throw new Error("Clinic not found.");
  return row.timezone;
}

async function loadMcpSlotContext(db: McpQueryDb, args: {
  clinicId: string;
  branchId: string;
  doctorId: string;
  date: string;
  tz: string;
  excludeAppointmentId?: string;
}) {
  const { start, end } = dayBoundsUtc(args.date, args.tz);
  const [hours, doctorHours, booked] = await Promise.all([
    db.execute(sql`select weekday, opens_at, closes_at from public.clinic_hours where clinic_id=${args.clinicId} and branch_id=${args.branchId}`),
    db.execute(sql`select weekday, starts_at, ends_at from public.doctor_hours where clinic_id=${args.clinicId} and branch_id=${args.branchId} and doctor_id=${args.doctorId}`),
    db.execute(sql`select id, starts_at, ends_at from public.appointments where clinic_id=${args.clinicId} and doctor_id=${args.doctorId} and status in ('scheduled','confirmed','completed') and starts_at < ${end} and ends_at > ${start}`),
  ]);
  const branchHours = hours.map((row) => ({
    weekday: Number(row.weekday), start: String(row.opens_at), end: String(row.closes_at),
  })) satisfies HourWindow[];
  const doctorWindows = doctorHours.map((row) => ({
    weekday: Number(row.weekday), start: String(row.starts_at), end: String(row.ends_at),
  })) satisfies HourWindow[];
  const busy = booked.filter((row) => row.id !== args.excludeAppointmentId).map((row) => ({
    startsAt: String(row.starts_at), endsAt: String(row.ends_at),
  }));
  return { branchHours, doctorHours: doctorWindows, booked: busy };
}

function clinicDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}

async function assertOpenSlot(db: McpQueryDb, args: {
  clinicId: string;
  branchId: string;
  doctorId: string;
  startsAt: string;
  durationMinutes: number;
  tz: string;
  excludeAppointmentId?: string;
}) {
  const date = clinicDate(args.startsAt, args.tz);
  const slotContext = await loadMcpSlotContext(db, { ...args, date });
  if (!isOpenSlot({
    date, tz: args.tz, durationMin: args.durationMinutes, now: new Date(), ...slotContext,
  }, args.startsAt)) throw new Error("That time is not an available appointment slot.");
}

const GENERIC_MESSAGE = "The request could not be completed.";

function pgCode(error: unknown): string | undefined {
  for (let e: unknown = error, i = 0; e && typeof e === "object" && i < 3; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && code.length === 5) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Message safe to show an MCP client: our own Errors pass through, database errors are mapped.
 * Drizzle wraps driver errors ("Failed query: ... params: ...") and keeps the SQLSTATE on `cause`.
 */
export function safeToolMessage(error: unknown): string {
  const code = pgCode(error);
  if (code) return code === "23P01" ? "That time is no longer available." : GENERIC_MESSAGE;
  if (error instanceof Error && !/^Failed query:/i.test(error.message)) return error.message;
  return GENERIC_MESSAGE;
}

/** Audit is best-effort after the work has committed: it never changes the tool result. */
async function auditBestEffort(auth: McpAuth, tool: string, outcome: "success" | "failure") {
  try {
    await auditMcpCall(auth, tool, outcome);
  } catch (error) {
    const code = typeof (error as { code?: unknown } | null)?.code === "string" ? (error as { code: string }).code : "unknown";
    console.error(`mcp audit failed (code ${code})`);
  }
}

async function run<T>(auth: McpAuth, tool: string, work: (db: McpQueryDb) => Promise<T>) {
  let result: T;
  try {
    result = await withMcpClinic(auth.clinicId, work);
  } catch (error) {
    await auditBestEffort(auth, tool, "failure");
    return {
      isError: true,
      content: [{ type: "text" as const, text: safeToolMessage(error) }],
    };
  }
  await auditBestEffort(auth, tool, "success");
  return { content: [{ type: "text" as const, text: toText(result) }] };
}

function requireScope(auth: McpAuth, scope: string) {
  if (!auth.scopes.includes(scope)) throw new Error(`This token needs the ${scope} scope.`);
}

export function buildMcpServer(auth: McpAuth) {
  const server = new McpServer({ name: `${APP_NAME.toLowerCase()}-clinic`, version: "1.0.0" });

  server.registerTool(
    "list_appointments",
    {
      description: "List appointments in a bounded clinic-local date range.",
      inputSchema: z.object({ from: date, to: date, doctor_id: id.optional(), branch_id: id.optional() }),
    },
    (input) => run(auth, "list_appointments", async (db) => {
      requireScope(auth, "appointments:read");
      if (input.to < input.from || (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000 > 31)
        throw new Error("Choose a date range of 31 days or less.");
      const tz = await clinicTimezone(db, auth.clinicId);
      const { start } = dayBoundsUtc(input.from, tz);
      const { end } = dayBoundsUtc(input.to, tz);
      const rows = await db.execute(sql`
        select id, patient_id, doctor_id, branch_id, starts_at, ends_at, status
        from public.appointments
        where clinic_id = ${auth.clinicId} and starts_at >= ${start} and starts_at < ${end}
          and (${input.doctor_id ?? null}::uuid is null or doctor_id = ${input.doctor_id ?? null}::uuid)
          and (${input.branch_id ?? null}::uuid is null or branch_id = ${input.branch_id ?? null}::uuid)
        order by starts_at limit 200
      `);
      return rows;
    }),
  );

  server.registerTool(
    "find_patient",
    { description: "Find patients by name or phone. Requires patient read access.", inputSchema: z.object({ query: z.string().trim().min(2).max(80) }) },
    (input) => run(auth, "find_patient", async (db) => {
      requireScope(auth, "patients:read");
      const needle = `%${input.query.replace(/[,%_]/g, "\\$&")}%`;
      return db.execute(sql`
        select id, patient_number, full_name, phone, email
        from public.patients where clinic_id = ${auth.clinicId}
          and (full_name ilike ${needle} or phone ilike ${needle})
        order by full_name limit 25
      `);
    }),
  );

  server.registerTool(
    "get_patient_summary",
    { description: "Read patient demographics and recent appointments; excludes clinical notes.", inputSchema: z.object({ patient_id: id }) },
    (input) => run(auth, "get_patient_summary", async (db) => {
      requireScope(auth, "patients:read");
      const [patient] = await db.execute(sql`
        select id, patient_number, full_name, birthdate, sex, phone, email
        from public.patients where clinic_id = ${auth.clinicId} and id = ${input.patient_id} limit 1
      `);
      if (!patient) throw new Error("Patient not found.");
      const appointments = await db.execute(sql`
        select id, starts_at, ends_at, status, doctor_id, branch_id
        from public.appointments where clinic_id = ${auth.clinicId} and patient_id = ${input.patient_id}
        order by starts_at desc limit 20
      `);
      return { patient, appointments };
    }),
  );

  server.registerTool(
    "daily_summary",
    { description: "Return aggregate appointment and billing counts for at most 31 days.", inputSchema: z.object({ from: date, to: date }) },
    (input) => run(auth, "daily_summary", async (db) => {
      requireScope(auth, "daily_summary:read");
      if (input.to < input.from || (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000 > 31)
        throw new Error("Choose a date range of 31 days or less.");
      const tz = await clinicTimezone(db, auth.clinicId);
      const { start } = dayBoundsUtc(input.from, tz);
      const { end } = dayBoundsUtc(input.to, tz);
      const [appointments, payments, invoices] = await Promise.all([
        db.execute(sql`select status, count(*)::int as count from public.appointments where clinic_id=${auth.clinicId} and starts_at >= ${start} and starts_at < ${end} group by status`),
        db.execute(sql`select coalesce(sum(amount_centavos),0)::bigint as collected_centavos from public.payments where clinic_id=${auth.clinicId} and status='succeeded' and paid_at >= ${start} and paid_at < ${end}`),
        db.execute(sql`select status, count(*)::int as count from public.invoices where clinic_id=${auth.clinicId} and created_at >= ${start} and created_at < ${end} group by status`),
      ]);
      return { appointments, payments, invoices };
    }),
  );

  server.registerTool(
    "book_appointment",
    { description: "Book a clinic appointment. The database prevents double booking.", inputSchema: z.object({ patient_id: id, doctor_id: id, branch_id: id, starts_at: z.iso.datetime(), duration_minutes: z.number().int().min(15).max(240) }) },
    (input) => run(auth, "book_appointment", async (db) => {
      requireScope(auth, "appointments:write");
      const start = new Date(input.starts_at);
      const end = new Date(start.getTime() + input.duration_minutes * 60_000);
      const tz = await clinicTimezone(db, auth.clinicId);
      await assertOpenSlot(db, {
        clinicId: auth.clinicId, branchId: input.branch_id, doctorId: input.doctor_id,
        startsAt: start.toISOString(), durationMinutes: input.duration_minutes, tz,
      });
      const [row] = await db.execute(sql`
        insert into public.appointments (clinic_id, patient_id, doctor_id, branch_id, starts_at, ends_at, status, source)
        values (${auth.clinicId}, ${input.patient_id}, ${input.doctor_id}, ${input.branch_id}, ${start.toISOString()}, ${end.toISOString()}, 'scheduled', 'ai')
        returning id, starts_at, ends_at, status
      `);
      return row;
    }),
  );

  server.registerTool(
    "reschedule_appointment",
    { description: "Move an appointment to a new time.", inputSchema: z.object({ appointment_id: id, starts_at: z.iso.datetime() }) },
    (input) => run(auth, "reschedule_appointment", async (db) => {
      requireScope(auth, "appointments:write");
      const [current] = await db.execute(sql`select id, starts_at, ends_at, status, doctor_id, branch_id from public.appointments where clinic_id=${auth.clinicId} and id=${input.appointment_id} limit 1`);
      if (!current || !["scheduled", "confirmed"].includes(String(current.status))) throw new Error("Appointment cannot be rescheduled.");
      const duration = new Date(String(current.ends_at)).getTime() - new Date(String(current.starts_at)).getTime();
      const start = new Date(input.starts_at);
      const end = new Date(start.getTime() + duration);
      const tz = await clinicTimezone(db, auth.clinicId);
      await assertOpenSlot(db, {
        clinicId: auth.clinicId, branchId: String(current.branch_id), doctorId: String(current.doctor_id),
        startsAt: start.toISOString(), durationMinutes: duration / 60_000, tz,
        excludeAppointmentId: input.appointment_id,
      });
      const [row] = await db.execute(sql`update public.appointments set starts_at=${start.toISOString()}, ends_at=${end.toISOString()} where clinic_id=${auth.clinicId} and id=${input.appointment_id} returning id, starts_at, ends_at, status`);
      return row;
    }),
  );

  server.registerTool(
    "create_invoice",
    { description: "Create a draft invoice; totals are derived by the database.", inputSchema: z.object({ patient_id: id, due_on: date, items: z.array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.number().int().min(1).max(1000), unit_price_centavos: z.number().int().min(0).max(100_000_000) })).min(1).max(50) }) },
    (input) => run(auth, "create_invoice", async (db) => {
      requireScope(auth, "invoices:write");
      const [invoice] = await db.execute(sql`insert into public.invoices (clinic_id, patient_id, due_on) values (${auth.clinicId}, ${input.patient_id}, ${input.due_on}) returning id, invoice_number, status`);
      if (!invoice) throw new Error("Invoice creation failed.");
      for (const [position, item] of input.items.entries())
        await db.execute(sql`insert into public.invoice_items (clinic_id, invoice_id, position, description, quantity, unit_price_centavos) values (${auth.clinicId}, ${invoice.id}, ${position}, ${item.description}, ${item.quantity}, ${item.unit_price_centavos})`);
      return invoice;
    }),
  );

  server.registerTool(
    "request_payment",
    { description: "Ask staff to approve creating a payment link. This tool never creates a link.", inputSchema: z.object({ invoice_id: id }) },
    (input) => run(auth, "request_payment", async (db) => {
      requireScope(auth, "payments:request");
      if (!onlinePaymentsEnabled()) throw new Error("Online payment requests are not available yet.");
      const [invoice] = await db.execute(sql`select id, invoice_number, total_centavos, status from public.invoices where clinic_id=${auth.clinicId} and id=${input.invoice_id} limit 1`);
      if (!invoice || !["draft", "sent"].includes(String(invoice.status))) throw new Error("Invoice is not payable.");
      const [paymentTotals] = await db.execute(sql`select coalesce(sum(amount_centavos), 0)::bigint as paid_centavos from public.payments where clinic_id=${auth.clinicId} and invoice_id=${input.invoice_id} and status='succeeded'`);
      const due = Number(invoice.total_centavos) - Number(paymentTotals?.paid_centavos ?? 0);
      if (due <= 0) throw new Error("Invoice has no outstanding balance.");
      const [proposal] = await db.execute(sql`
        insert into public.agent_actions (clinic_id, kind, status, autonomy, payload, outcome)
        values (${auth.clinicId}, 'mcp_request_payment', 'proposed', 'approve', jsonb_build_object('invoice_id', ${input.invoice_id}), 'Waiting for staff approval')
        returning id, status
      `);
      return { request_id: proposal?.id, status: "awaiting_staff_approval" };
    }),
  );

  return server;
}
