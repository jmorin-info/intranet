"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import { Tags, Globe } from "lucide-react";
import { SKILL_COLORS } from "./types";

interface ProfileSkillsLanguagesProps {
  skills: string[];
  languages: string[];
}

/**
 * Read-only display of parsed skills and languages as chips.
 * Editing lives in {@link ProfilePersonalInfo} (edit-in-place).
 */
export function ProfileSkillsLanguages({
  skills,
  languages,
}: ProfileSkillsLanguagesProps) {
  if (skills.length === 0 && languages.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          Compétences & langues
        </h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {skills.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-seal-gray-500 dark:text-slate-500 uppercase tracking-widest mb-2">
              Compétences
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill, i) => (
                <span
                  key={skill}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${SKILL_COLORS[i % SKILL_COLORS.length]}`}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
        {languages.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-seal-gray-500 dark:text-slate-500 uppercase tracking-widest mb-2">
              Langues
            </p>
            <div className="flex flex-wrap gap-1.5">
              {languages.map((lang) => (
                <span
                  key={lang}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-seal-navy dark:text-white border border-gray-200 dark:border-slate-700"
                >
                  <Globe className="h-3 w-3 text-seal-gray-500" /> {lang}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
