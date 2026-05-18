import type { LucideIcon } from "lucide-react";
import { Mail, UserCog } from "lucide-react";
import { getContentBlocks, getBlockData } from "@/lib/cms";

type IconKey = "Mail" | "UserCog";
type AccentKey = "orange" | "blue";

interface ContactItem {
  iconKey: IconKey;
  accent: AccentKey;
  label: string;
  email: string;
}

const ICON_REGISTRY: Record<IconKey, LucideIcon> = {
  Mail,
  UserCog,
};

const ACCENTS: Record<
  AccentKey,
  { tile: string; ring: string; text: string; hover: string }
> = {
  orange: {
    tile: "bg-[#f9964a]/10",
    ring: "ring-[#f9964a]/20",
    text: "text-[#f9964a]",
    hover: "group-hover:text-[#f9964a] hover:border-[#f9964a]/50",
  },
  blue: {
    tile: "bg-[#296dc1]/10",
    ring: "ring-[#296dc1]/20",
    text: "text-[#296dc1]",
    hover: "group-hover:text-[#296dc1] hover:border-[#296dc1]/50",
  },
};

const FALLBACK_CONTACTS: ContactItem[] = [
  {
    iconKey: "Mail",
    accent: "orange",
    label: "Conformité",
    email: "compliance@omnitech-security.fr",
  },
  {
    iconKey: "UserCog",
    accent: "blue",
    label: "Délégué à la protection des données",
    email: "dpo@omnitech-security.fr",
  },
];

function normalizeContact(raw: unknown): ContactItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const iconKey = typeof o.iconKey === "string" ? o.iconKey : null;
  const accent = typeof o.accent === "string" ? o.accent : null;
  const label = typeof o.label === "string" ? o.label : null;
  const email = typeof o.email === "string" ? o.email : null;
  if (!iconKey || !accent || !label || !email) return null;
  if (!(iconKey in ICON_REGISTRY)) return null;
  if (!(accent in ACCENTS)) return null;
  return {
    iconKey: iconKey as IconKey,
    accent: accent as AccentKey,
    label,
    email,
  };
}

export async function TrustContact() {
  const blocks = await getContentBlocks(["trust.contact"], "fr");
  const raw = getBlockData<unknown[]>(blocks, "trust.contact", []);
  const fromCms = Array.isArray(raw)
    ? raw.map(normalizeContact).filter((c): c is ContactItem => c !== null)
    : [];
  const contacts = fromCms.length > 0 ? fromCms : FALLBACK_CONTACTS;

  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="mt-20 scroll-mt-24"
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
          Contact
        </p>
        <h2
          id="contact-title"
          className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
        >
          Une question sur la conformité&nbsp;?
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {contacts.map((c) => {
          const Icon = ICON_REGISTRY[c.iconKey];
          const accent = ACCENTS[c.accent];
          return (
            <a
              key={c.email}
              href={`mailto:${c.email}`}
              className={`group flex items-center gap-4 rounded-2xl border border-[#F68D2E]/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${accent.hover}`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${accent.tile} ${accent.ring}`}
              >
                <Icon className={`h-6 w-6 ${accent.text}`} aria-hidden="true" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-[#837274] dark:text-slate-400">
                  {c.label}
                </div>
                <div
                  className={`font-display text-base font-bold text-slate-900 dark:text-white ${accent.hover}`}
                >
                  {c.email}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export { normalizeContact, FALLBACK_CONTACTS };
export type {
  ContactItem,
  IconKey as ContactIconKey,
  AccentKey as ContactAccentKey,
};
