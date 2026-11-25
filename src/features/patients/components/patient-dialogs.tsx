"use client";

import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/form-dialog";
import { createPatientAction, updatePatientAction } from "@/features/patients/actions";
import type { Patient } from "@/features/patients/schemas";
import { PatientForm } from "./patient-form";

export function AddPatientDialog() {
  return (
    <FormDialog
      title="Add patient"
      description="Name and contact details. Clinical notes are added as visits."
      trigger={
        <Button>
          <UserPlus aria-hidden="true" /> Add patient
        </Button>
      }
    >
      {() => <PatientForm action={createPatientAction} submitLabel="Add patient" />}
    </FormDialog>
  );
}

export function EditPatientDialog({ patient }: { patient: Patient }) {
  return (
    <FormDialog title="Edit patient" trigger={<Button variant="ghost">Edit details</Button>}>
      {(close) => (
        <PatientForm
          action={updatePatientAction}
          patient={patient}
          submitLabel="Save changes"
          onDone={close}
        />
      )}
    </FormDialog>
  );
}
