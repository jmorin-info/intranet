'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button, Textarea, Input } from '@omnitech/ui';
import { X, Send, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

const MIN_LENGTH = 20;
const MAX_LENGTH = 280;

interface SubmitTestimonialDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * Boîte de dialogue de soumission d'un témoignage utilisateur.
 *
 * Affiché : bouton dans /profile OU trigger auto rare (hook dédié côté caller).
 * Contraintes : 20-280 caractères, signature optionnelle. Après soumission,
 * le témoignage part en modération ADMIN avant affichage sur /welcome.
 */
export function SubmitTestimonialDialog({ open, onClose, onSubmitted }: SubmitTestimonialDialogProps) {
  const [quote, setQuote] = useState('');
  const [department, setDepartment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const length = quote.trim().length;
  const valid = length >= MIN_LENGTH && length <= MAX_LENGTH;

  const handleSubmit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await api.post('/testimonials', {
        quote: quote.trim(),
        department: department.trim() || undefined,
      });
      toast.success('Merci — votre témoignage sera visible après modération.');
      setQuote('');
      setDepartment('');
      onClose();
      onSubmitted?.();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur lors de l\'envoi du témoignage.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 p-1.5 rounded-lg text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9964A]/15 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-[#F9964A]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
              Partagez votre expérience
            </h2>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
              Une phrase sur ce que l&apos;intranet vous apporte au quotidien. Votre témoignage sera relu par un administrateur avant publication.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-seal-navy dark:text-white mb-1 block">
              Votre témoignage <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={4}
              maxLength={MAX_LENGTH + 20}
              placeholder="Ex: Le workflow documentaire m'a fait gagner plusieurs heures par semaine sur les validations."
            />
            <div className="flex items-center justify-between mt-1">
              <span
                className={`text-[11px] ${
                  length === 0
                    ? 'text-seal-gray-500'
                    : length < MIN_LENGTH
                    ? 'text-amber-600'
                    : length > MAX_LENGTH
                    ? 'text-red-600'
                    : 'text-emerald-600'
                }`}
              >
                {length} / {MAX_LENGTH} caractères (min. {MIN_LENGTH})
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-seal-navy dark:text-white mb-1 block">
              Signature affichée (optionnel)
            </label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="— Direction IT / Service RH / Collaborateur…"
              maxLength={80}
            />
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 mt-1">
              Laissez vide pour utiliser votre département actuel. Vous n&apos;apparaîtrez jamais nommément.
            </p>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300">
              Votre témoignage sera examiné avant d&apos;être publié sur le portail. Vous ne pouvez soumettre qu&apos;un témoignage tous les 3 mois.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!valid || submitting}
            loading={submitting}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            Envoyer
          </Button>
        </div>
      </div>
    </div>
  );
}
