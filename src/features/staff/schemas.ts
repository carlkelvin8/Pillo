import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { ROLES } from "@/features/auth/permissions";

export const INVITABLE_ROLES = ["doctor", "receptionist", "billing"] as const;

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(INVITABLE_ROLES, { error: "Choose a role." }),
});
export const changeRoleSchema = z.object({ membershipId: z.uuid(), role: z.enum(ROLES) });
export const membershipIdSchema = z.object({ membershipId: z.uuid() });
export const invitationIdSchema = z.object({ invitationId: z.uuid() });
