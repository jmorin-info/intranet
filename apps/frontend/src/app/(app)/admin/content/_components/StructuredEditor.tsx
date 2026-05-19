"use client";

/**
 * Éditeur form-driven pour `data` d'un ContentBlock CMS.
 *
 * - Consomme un `BlockSchema` (cf. `lib/cms-admin/schemas.ts`).
 * - Rend des inputs typés (string, enum, icon picker) + listes éditables
 *   pour les schémas de type `array` (+/− items, drag-drop léger).
 * - L'état est entièrement contrôlé par le parent (`value` + `onChange`) pour
 *   que la page éditeur puisse synchroniser un repli JSON.
 */

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { Button, Input, Textarea } from "@omnitech/ui";

import type {
  BlockSchema,
  DataSchema,
  EnumOption,
  FieldDef,
} from "@/lib/cms-admin/schemas";

interface Props {
  schema: BlockSchema;
  /** `unknown` car le JSON peut être quoi que ce soit. On normalise dedans. */
  value: unknown;
  onChange: (next: unknown) => void;
}

export function StructuredEditor({ schema, value, onChange }: Props) {
  if (!schema.data) {
    return (
      <p className="text-xs text-seal-gray-500 italic">
        Ce bloc n'a pas de payload structuré — seul le champ « Corps » est
        éditable.
      </p>
    );
  }

  return (
    <SchemaRenderer
      schema={schema.data}
      value={value}
      onChange={onChange}
      path=""
    />
  );
}

// ---------------------------------------------------------------------------
// Rendu d'un schéma (object/array)
// ---------------------------------------------------------------------------

function SchemaRenderer({
  schema,
  value,
  onChange,
  path,
}: {
  schema: DataSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  path: string;
}) {
  if (schema.kind === "object") {
    return (
      <ObjectRenderer
        fields={schema.fields}
        value={
          (value && typeof value === "object" ? value : {}) as Record<
            string,
            unknown
          >
        }
        onChange={onChange}
        path={path}
      />
    );
  }
  return (
    <ArrayRenderer
      schema={schema}
      value={Array.isArray(value) ? value : []}
      onChange={onChange}
      path={path}
    />
  );
}

// ---------------------------------------------------------------------------
// Objet
// ---------------------------------------------------------------------------

function ObjectRenderer({
  fields,
  value,
  onChange,
  path,
}: {
  fields: ReadonlyArray<FieldDef>;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  path: string;
}) {
  const setField = useCallback(
    (name: string, next: unknown) => {
      onChange({ ...value, [name]: next });
    },
    [value, onChange],
  );
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          value={value[field.name]}
          onChange={(v) => setField(field.name, v)}
          path={`${path}.${field.name}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tableau
// ---------------------------------------------------------------------------

function ArrayRenderer({
  schema,
  value,
  onChange,
  path,
}: {
  schema: Extract<DataSchema, { kind: "array" }>;
  value: unknown[];
  onChange: (next: unknown[]) => void;
  path: string;
}) {
  const addItem = useCallback(() => {
    const empty =
      schema.item.kind === "string"
        ? ""
        : Object.fromEntries(
            schema.item.fields.map((f) => [f.name, defaultForField(f)]),
          );
    onChange([...value, empty]);
  }, [schema, value, onChange]);

  const removeItem = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange],
  );

  const moveItem = useCallback(
    (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= value.length) return;
      const next = [...value];
      const tmp = next[idx];
      next[idx] = next[target]!;
      next[target] = tmp!;
      onChange(next);
    },
    [value, onChange],
  );

  const setItem = useCallback(
    (idx: number, next: unknown) => {
      const arr = [...value];
      arr[idx] = next;
      onChange(arr);
    },
    [value, onChange],
  );

  const limitsHint = [
    typeof schema.minItems === "number" ? `≥ ${schema.minItems}` : null,
    typeof schema.maxItems === "number" ? `≤ ${schema.maxItems}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-seal-gray-300/30 pb-2">
        <p className="text-xs text-seal-gray-500">
          {value.length} item{value.length > 1 ? "s" : ""}
          {limitsHint ? ` (${limitsHint})` : ""}
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={addItem}
          disabled={
            typeof schema.maxItems === "number" &&
            value.length >= schema.maxItems
          }
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter un item
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs italic text-seal-gray-500 py-4 text-center border border-dashed border-seal-gray-300/40 rounded">
          Liste vide — l'affichage front retombera sur le fallback hardcodé.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((item, idx) => (
            <li
              key={idx}
              className="rounded-lg border border-seal-gray-300/40 bg-white dark:bg-slate-900 p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-seal-gray-300/20">
                <div className="flex items-center gap-2 text-xs font-medium text-seal-navy dark:text-white">
                  <GripVertical
                    className="h-4 w-4 text-seal-gray-500"
                    aria-hidden="true"
                  />
                  <span>
                    #{idx + 1} —{" "}
                    {schema.itemTitle?.(item, idx) ?? `Item ${idx + 1}`}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Monter"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === value.length - 1}
                    aria-label="Descendre"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(idx)}
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>

              {schema.item.kind === "string" ? (
                <StringField
                  value={typeof item === "string" ? item : ""}
                  onChange={(v) => setItem(idx, v)}
                  multiline={schema.item.multiline}
                  placeholder={schema.item.placeholder}
                />
              ) : (
                <ObjectRenderer
                  fields={schema.item.fields}
                  value={
                    (item && typeof item === "object" ? item : {}) as Record<
                      string,
                      unknown
                    >
                  }
                  onChange={(v) => setItem(idx, v)}
                  path={`${path}[${idx}]`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field renderer
// ---------------------------------------------------------------------------

function FieldRenderer({
  field,
  value,
  onChange,
  path,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  path: string;
}) {
  const id = `cms-field-${path}`;
  return (
    <div>
      <label htmlFor={id} className="seal-label">
        {field.label}
        {field.required ? (
          <span className="text-red-600" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {field.type.kind === "string" ? (
        <StringField
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          multiline={field.type.multiline}
          placeholder={field.placeholder}
        />
      ) : (
        <EnumSelect
          id={id}
          value={typeof value === "string" ? value : ""}
          options={field.type.options}
          onChange={onChange}
        />
      )}
      {field.help ? (
        <p className="text-[11px] text-seal-gray-500 mt-1">{field.help}</p>
      ) : null}
    </div>
  );
}

function StringField({
  id,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  if (multiline) {
    return (
      <Textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function EnumSelect({
  id,
  value,
  options,
  onChange,
}: {
  id?: string;
  value: string;
  options: ReadonlyArray<EnumOption>;
  onChange: (next: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="seal-input w-full"
    >
      {options.some((o) => o.value === value) ? null : (
        <option value="" disabled>
          — Sélectionner —
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function defaultForField(field: FieldDef): unknown {
  if (field.type.kind === "string") return "";
  // enum / icon → première option par défaut.
  return field.type.options[0]?.value ?? "";
}
