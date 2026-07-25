"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Disponibilité dynamique de l'éditeur OnlyOffice, servie par
 * GET /office/availability (endpoint public, cache 30s côté backend).
 *
 * Utilisée pour désactiver les boutons « OnlyOffice » (tooltip « Éditeur en
 * maintenance ») et court-circuiter les pages éditeur avec un message propre
 * quand le Docs Server est indisponible — au lieu du watchdog 20s.
 */
export interface OfficeAvailability {
  available: boolean;
  reason?: string;
}

export const OFFICE_MAINTENANCE_MESSAGE = "Éditeur en maintenance";

const TTL_MS = 30_000;
let cache: { at: number; value: OfficeAvailability } | null = null;
let inflight: Promise<OfficeAvailability> | null = null;

/**
 * Fetch avec cache module-scope 30s + déduplication des appels concurrents
 * (plusieurs composants peuvent consommer la disponibilité sur la même page).
 */
export async function fetchOfficeAvailability(): Promise<OfficeAvailability> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  if (!inflight) {
    inflight = api
      .get<OfficeAvailability>("/office/availability")
      .then(({ data }) => {
        const value: OfficeAvailability =
          data && typeof data.available === "boolean"
            ? data
            : { available: false, reason: "Réponse du serveur invalide" };
        cache = { at: Date.now(), value };
        return value;
      })
      .catch(() => {
        const value: OfficeAvailability = {
          available: false,
          reason: "Service de disponibilité injoignable",
        };
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Hook React : `availability` vaut `null` pendant le chargement initial
 * (les consommateurs restent optimistes tant que la réponse n'est pas là,
 * pour éviter un flash de désactivation).
 */
export function useOfficeAvailability(): {
  availability: OfficeAvailability | null;
  /** true UNIQUEMENT quand la réponse est arrivée et que l'éditeur est KO */
  officeDown: boolean;
} {
  const [availability, setAvailability] = useState<OfficeAvailability | null>(
    cache && Date.now() - cache.at < TTL_MS ? cache.value : null,
  );

  useEffect(() => {
    let mounted = true;
    fetchOfficeAvailability().then((value) => {
      if (mounted) setAvailability(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    availability,
    officeDown: availability !== null && !availability.available,
  };
}
