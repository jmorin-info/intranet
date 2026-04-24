"use client";

import React from "react";
import { Card, CardContent, CardHeader, Button } from "@omnitech/ui";
import { PenLine, Save, Phone, MapPin, Tags, Globe, Link2 } from "lucide-react";
import { EditInPlaceField } from "./edit-in-place-field";

interface ProfilePersonalInfoProps {
  editPhone: string;
  setEditPhone: (v: string) => void;
  editLocation: string;
  setEditLocation: (v: string) => void;
  editSkills: string;
  setEditSkills: (v: string) => void;
  editLanguages: string;
  setEditLanguages: (v: string) => void;
  editTeamsLink: string;
  setEditTeamsLink: (v: string) => void;
  savingProfile: boolean;
  onSave: () => void;
}

export function ProfilePersonalInfo({
  editPhone,
  setEditPhone,
  editLocation,
  setEditLocation,
  editSkills,
  setEditSkills,
  editLanguages,
  setEditLanguages,
  editTeamsLink,
  setEditTeamsLink,
  savingProfile,
  onSave,
}: ProfilePersonalInfoProps) {
  const fields = [
    {
      icon: Phone,
      label: "Téléphone",
      value: editPhone,
      setter: setEditPhone,
      placeholder: "+33 1 23 45 67 89",
    },
    {
      icon: MapPin,
      label: "Localisation",
      value: editLocation,
      setter: setEditLocation,
      placeholder: "Bureau 301, Paris",
    },
    {
      icon: Tags,
      label: "Compétences",
      value: editSkills,
      setter: setEditSkills,
      placeholder: "Cybersécurité, ISO 27001, Audit",
    },
    {
      icon: Globe,
      label: "Langues",
      value: editLanguages,
      setter: setEditLanguages,
      placeholder: "Français, Anglais",
    },
    {
      icon: Link2,
      label: "Lien Teams",
      value: editTeamsLink,
      setter: setEditTeamsLink,
      placeholder: "https://teams.microsoft.com/...",
    },
  ] as const;

  return (
    <Card className="shadow-sm rounded-xl">
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          Informations personnelles
        </h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map(({ icon: Icon, label, value, setter, placeholder }) => (
          <EditInPlaceField
            key={label}
            icon={Icon}
            label={label}
            value={value}
            onChange={setter}
            placeholder={placeholder}
          />
        ))}
        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            onClick={onSave}
            loading={savingProfile}
            disabled={savingProfile}
          >
            <Save className="h-3.5 w-3.5" />{" "}
            {savingProfile ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
