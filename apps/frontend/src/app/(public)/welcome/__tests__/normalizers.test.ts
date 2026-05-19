import { describe, it, expect } from "vitest";

import {
  normalizeWelcomeBanner,
  normalizeWelcomeMedia,
  normalizeTestimonial,
} from "../_cms";

describe("welcome.banner normalizer", () => {
  it("accepte un bandeau bien formé", () => {
    const b = normalizeWelcomeBanner({
      message: "Maintenance dimanche",
      variant: "warn",
      active: true,
    });
    expect(b).toEqual({
      message: "Maintenance dimanche",
      variant: "warn",
      active: true,
      ctaLabel: undefined,
      ctaHref: undefined,
    });
  });

  it("accepte un CTA optionnel", () => {
    const b = normalizeWelcomeBanner({
      message: "Voir",
      variant: "info",
      ctaLabel: "Détails",
      ctaHref: "/news/123",
    });
    expect(b?.ctaLabel).toBe("Détails");
    expect(b?.ctaHref).toBe("/news/123");
  });

  it("rejette un variant hors enum", () => {
    expect(
      normalizeWelcomeBanner({ message: "X", variant: "neon" }),
    ).toBeNull();
  });

  it("active = false explicitement honoré", () => {
    const b = normalizeWelcomeBanner({
      message: "X",
      variant: "info",
      active: false,
    });
    expect(b?.active).toBe(false);
  });

  it("rejette message/variant manquants", () => {
    expect(normalizeWelcomeBanner({ variant: "info" })).toBeNull();
    expect(normalizeWelcomeBanner({ message: "X" })).toBeNull();
    expect(normalizeWelcomeBanner(null)).toBeNull();
  });
});

describe("welcome.testimonials normalizer", () => {
  it("accepte un témoignage complet", () => {
    const t = normalizeTestimonial({
      quote: "Très utile.",
      author: "Marie D.",
      role: "RSSI",
    });
    expect(t).toEqual({
      quote: "Très utile.",
      author: "Marie D.",
      role: "RSSI",
    });
  });

  it("rejette champs manquants ou non-string", () => {
    expect(normalizeTestimonial({ quote: "X", author: "Y" })).toBeNull();
    expect(
      normalizeTestimonial({ quote: 123, author: "Y", role: "Z" }),
    ).toBeNull();
    expect(normalizeTestimonial(null)).toBeNull();
  });
});

describe("welcome.media normalizer", () => {
  it("accepte une image avec src relatif", () => {
    const m = normalizeWelcomeMedia({
      type: "image",
      src: "/img/hero.jpg",
      caption: "Logo OMNITECH",
    });
    expect(m).toEqual({
      type: "image",
      src: "/img/hero.jpg",
      caption: "Logo OMNITECH",
      description: undefined,
    });
  });

  it("accepte une vidéo avec src https", () => {
    const m = normalizeWelcomeMedia({
      type: "video",
      src: "https://example.com/demo.mp4",
      caption: "Démo intranet",
    });
    expect(m?.src).toBe("https://example.com/demo.mp4");
  });

  it("rejette src http://, javascript:, data:, ou relative sans /", () => {
    for (const src of [
      "http://insecure",
      "javascript:alert(1)",
      "data:image/png;base64,xxx",
      "relative-path.jpg",
    ]) {
      expect(
        normalizeWelcomeMedia({ type: "image", src, caption: "X" }),
      ).toBeNull();
    }
  });

  it("rejette type hors enum (audio, pdf, …)", () => {
    expect(
      normalizeWelcomeMedia({
        type: "audio",
        src: "/x.mp3",
        caption: "X",
      }),
    ).toBeNull();
  });

  it("description optionnelle (vide ou string)", () => {
    const m = normalizeWelcomeMedia({
      type: "image",
      src: "/x.jpg",
      caption: "X",
      description: "Sous-titre",
    });
    expect(m?.description).toBe("Sous-titre");
  });
});
