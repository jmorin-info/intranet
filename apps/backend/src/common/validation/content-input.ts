import { BadRequestException } from '@nestjs/common';

export function inputText(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new BadRequestException(`${label} doit être un texte de ${allowEmpty ? 0 : 1} à ${max} caractères.`);
  return value;
}
export function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Un objet est requis.');
  return value as Record<string, unknown>;
}
export function inputArray(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new BadRequestException(`${label} doit être une liste de ${max} éléments au maximum.`);
  return value;
}
