"use client";

import { useState } from "react";
import type { Devotional } from "@/lib/types";
import {
  parseEditableFields,
  buildFullDevotionalFromEditable,
  type EditableDevotionalFields,
} from "@/lib/devotional-fields";
import { DevotionalContent } from "@/components/devotional/DevotionalContent";

type EditorView = "write" | "split" | "preview";

interface AdminDevotionalEditorProps {
  fields: EditableDevotionalFields;
  onChange: (fields: EditableDevotionalFields) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-editor-field">
      <label>{children}</label>
    </div>
  );
}

function MarkdownField({
  value,
  onChange,
  rows = 6,
  placeholder,
  large,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  large?: boolean;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={`admin-editor-textarea ${mono ? "admin-editor-textarea-mono" : ""} ${large ? "min-h-[280px]" : ""}`}
    />
  );
}

function EditorForm({
  fields,
  onChange,
}: {
  fields: EditableDevotionalFields;
  onChange: (fields: EditableDevotionalFields) => void;
}) {
  const set = (patch: Partial<EditableDevotionalFields>) =>
    onChange({ ...fields, ...patch });

  return (
    <div className="space-y-6">
      <div>
        <FieldLabel>Cím</FieldLabel>
        <input
          type="text"
          value={fields.title}
          onChange={(e) => set({ title: e.target.value })}
          className="admin-editor-input font-serif text-lg"
        />
      </div>

      <div>
        <FieldLabel>Alapige (vers + hely)</FieldLabel>
        <MarkdownField
          value={fields.verse}
          onChange={(v) => set({ verse: v })}
          rows={3}
          placeholder="Zsoltárok 139:23-24 — …"
        />
      </div>

      <div>
        <FieldLabel>Elmélkedés (markdown)</FieldLabel>
        <MarkdownField
          value={fields.meditation}
          onChange={(v) => set({ meditation: v })}
          rows={14}
          large
          placeholder="**Kulcsmondat** és bekezdések…"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <FieldLabel>Mai imádság</FieldLabel>
          <MarkdownField
            value={fields.prayer}
            onChange={(v) => set({ prayer: v })}
            rows={5}
          />
        </div>
        <div>
          <FieldLabel>Gondolatébresztő kérdés</FieldLabel>
          <MarkdownField
            value={fields.reflectionQuestion}
            onChange={(v) => set({ reflectionQuestion: v })}
            rows={5}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <FieldLabel>Facebook rövid szöveg</FieldLabel>
          <MarkdownField
            value={fields.facebookCopy}
            onChange={(v) => set({ facebookCopy: v })}
            rows={4}
            mono
          />
        </div>
        <div>
          <FieldLabel>Kategória</FieldLabel>
          <input
            type="text"
            value={fields.category}
            onChange={(e) => set({ category: e.target.value })}
            className="admin-editor-input"
          />
        </div>
      </div>
    </div>
  );
}

export function AdminDevotionalEditor({ fields, onChange }: AdminDevotionalEditorProps) {
  const [view, setView] = useState<EditorView>("split");

  const previewContent = buildFullDevotionalFromEditable(fields).content;

  return (
    <div>
      <div className="admin-editor-tabs">
        {(
          [
            ["write", "Szerkesztés"],
            ["split", "Osztott nézet"],
            ["preview", "Előnézet"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-editor-tab ${view === key ? "admin-editor-tab-active" : ""}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "write" && <EditorForm fields={fields} onChange={onChange} />}

      {view === "split" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
          <EditorForm fields={fields} onChange={onChange} />
          <div className="admin-editor-preview">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-600 mb-5">
              Élő előnézet
            </p>
            <DevotionalContent content={previewContent} verse={fields.verse} />
          </div>
        </div>
      )}

      {view === "preview" && (
        <div className="admin-editor-preview max-w-3xl mx-auto">
          <DevotionalContent content={previewContent} verse={fields.verse} />
        </div>
      )}
    </div>
  );
}

export function initEditableFields(devotional: Devotional): EditableDevotionalFields {
  return parseEditableFields(devotional);
}
