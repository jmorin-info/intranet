import React from "react";
import { cn } from "./utils";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Texte d'aide sous le champ (ignoré si `error` présent). Alias historique : `hint`. */
  helperText?: string;
  /** @deprecated Utiliser `helperText`. Conservé pour rétrocompatibilité. */
  hint?: string;
  /**
   * Force l'affichage du marqueur ✓ "valide" (au-delà du fallback automatique
   * touched-AND-non-empty-AND-no-error). Utile quand un caller RHF veut
   * piloter explicitement via `formState.isValid`.
   */
  success?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      hint,
      success,
      id,
      disabled,
      onBlur,
      onChange,
      ...props
    },
    ref,
  ) => {
    const reactId = React.useId();
    const inputId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : reactId);
    const helpId = `${inputId}-help`;
    const errorId = `${inputId}-error`;
    const successId = `${inputId}-success`;
    const help = helperText ?? hint;

    // ─── Tracking interne pour le marqueur ✓ ──────────────────────────────
    // L'Input ne dépend pas de react-hook-form pour ne pas couper les autres
    // callers (formulaires custom, controlled simples). On suit donc :
    //  - touched : passe à true au 1er blur
    //  - hasValue : true si la valeur courante n'est pas vide
    // L'auto-success est rendu seulement si touched ∧ hasValue ∧ !error ∧
    // !disabled. Le prop `success` permet d'override (RHF).
    const [touched, setTouched] = React.useState(false);
    const [hasValue, setHasValue] = React.useState(
      Boolean(props.value || props.defaultValue),
    );
    const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
      setTouched(true);
      onBlur?.(e);
    };
    const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      setHasValue(e.target.value.length > 0);
      onChange?.(e);
    };

    const autoSuccess = touched && hasValue && !error && !disabled;
    const showSuccess = (success ?? autoSuccess) === true;

    const describedBy = error
      ? errorId
      : showSuccess
        ? successId
        : help
          ? helpId
          : undefined;

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[13px] font-semibold text-seal-navy dark:text-white"
          >
            {label}
            {props.required && (
              <span className="text-red-500 ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onBlur={handleBlur}
          onChange={handleChange}
          className={cn(
            "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base sm:text-sm transition-colors touch-manipulation",
            "placeholder:text-seal-gray-500",
            "focus:border-seal-navy focus:outline-none focus:ring-2 focus:ring-seal-navy/30",
            "dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500",
            disabled &&
              "bg-gray-50 dark:bg-slate-800 cursor-not-allowed opacity-70",
            error &&
              "border-red-500 focus:border-red-500 focus:ring-red-500/20",
            // Bordure verte subtile en cas de succès — visible mais pas
            // agressive (le ✓ texte ci-dessous porte le message principal).
            showSuccess &&
              "border-emerald-600/60 focus:border-emerald-600 focus:ring-emerald-600/20",
            className,
          )}
          {...props}
        />
        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400"
          >
            {/* A11y daltonisme : on combine couleur + icône + préfixe textuel
                "Erreur :" en sr-only pour que lecteurs d'écran et utilisateurs
                avec déficience visuelle des couleurs aient des signaux
                redondants. AlertCircle agrandi à h-4 et bordure border-red-500
                déjà appliquée sur l'input. */}
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Erreur :</span>
            <span>{error}</span>
          </p>
        )}
        {!error && showSuccess && (
          <p
            id={successId}
            className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
          >
            {/* Même pattern que l'erreur : icône + sr-only "Champ valide :" +
                texte court. Couleur verte au cas où le user voit les couleurs ;
                icône + texte assurent l'accessibilité daltonisme. */}
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Champ valide :</span>
            <span>Valide</span>
          </p>
        )}
        {help && !error && !showSuccess && (
          <p
            id={helpId}
            className="text-xs text-seal-gray-500 dark:text-slate-400"
          >
            {help}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
