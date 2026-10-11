"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Textarea } from "@/components/ui";
import { updatePlatformSettingsAction } from "@/app/actions/admin";

export function PlatformSettingsForm({ announcement, supportEmail }: { announcement: string; supportEmail: string }) {
  const [text, setText] = useState(announcement);
  return (
    <ActionForm action={updatePlatformSettingsAction}>
      {(f) => (
        <>
          <Field
            label="Anuncio de la plataforma"
            htmlFor="announcement"
            error={f.announcement}
            hint={`Se muestra como banner en todo el sitio. Dejalo vacío para no mostrar nada. ${text.length}/200`}
          >
            <Textarea id="announcement" name="announcement" rows={2} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={Boolean(f.announcement)} />
          </Field>
          <Field label="Email de soporte" htmlFor="supportEmail" error={f.supportEmail} hint="Opcional. Se muestra a los usuarios como contacto.">
            <Input id="supportEmail" name="supportEmail" type="email" maxLength={120} defaultValue={supportEmail} aria-invalid={Boolean(f.supportEmail)} />
          </Field>
          <SubmitButton>Guardar configuración</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
