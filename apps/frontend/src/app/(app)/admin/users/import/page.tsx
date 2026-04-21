'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, Button, Badge } from '@omnitech/ui';
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowLeft, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

interface ValidationError {
  line: number;
  field: string;
  message: string;
}

interface ValidRow {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  department?: string;
  jobTitle?: string;
  phone?: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
  validationErrors?: ValidationError[];
}

type Step = 'upload' | 'review' | 'done';

export default function ImportUsersPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [validRows, setValidRows] = useState<ValidRow[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (!csvFile) return;

    setFile(csvFile);
    setValidating(true);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const { data } = await api.post('/users/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setValidRows(data.valid || []);
      setErrors(data.errors || []);
      setStep('review');
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erreur de validation'
        : 'Erreur de validation';
      toast.error(message);
    } finally {
      setValidating(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post('/users/import/execute', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(data);
      setStep('done');
      toast.success(`${data.created} utilisateur(s) importe(s)`);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erreur lors de l\'import'
        : 'Erreur lors de l\'import';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setValidRows([]);
    setErrors([]);
    setResult(null);
  };

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '/api/v1');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/users">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-medium text-seal-navy dark:text-white">Importer des utilisateurs (CSV)</h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">Import en masse via fichier CSV</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className={step === 'upload' ? 'text-primary font-semibold' : 'text-seal-gray-500'}>1. Upload</span>
        <span className="text-seal-gray-500">/</span>
        <span className={step === 'review' ? 'text-primary font-semibold' : 'text-seal-gray-500'}>2. Validation</span>
        <span className="text-seal-gray-500">/</span>
        <span className={step === 'done' ? 'text-primary font-semibold' : 'text-seal-gray-500'}>3. Resultat</span>
      </div>

      {/* Template download */}
      <Card>
        <CardContent className="py-3 flex items-center justify-between">
          <p className="text-sm text-seal-navy dark:text-white">Télécharger le modèle CSV avec les en-têtes attendues</p>
          <a href={`${apiUrl}/users/import/template`} download>
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" />
              Template CSV
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardContent className="py-8">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-300 dark:border-slate-600 hover:border-primary'
              }`}
            >
              <input {...getInputProps()} />
              {validating ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <p className="text-sm text-seal-gray-500">Validation en cours...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-10 w-10 text-seal-gray-500 dark:text-slate-400" />
                  <div>
                    <p className="text-sm text-seal-navy dark:text-white">
                      {isDragActive ? 'Deposez le fichier ici' : 'Glissez-deposez un fichier CSV ou cliquez pour parcourir'}
                    </p>
                    <p className="text-xs text-seal-gray-500 mt-1">CSV uniquement, 5 Mo maximum</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review */}
      {step === 'review' && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-medium text-seal-navy dark:text-white">{validRows.length}</p>
                  <p className="text-xs text-seal-gray-500">Lignes valides</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-2xl font-medium text-seal-navy dark:text-white">{errors.length}</p>
                  <p className="text-xs text-seal-gray-500">Erreurs</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Valid rows table */}
          {validRows.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-seal-navy dark:text-white text-sm">Utilisateurs a importer</h2>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Email</th>
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Prenom</th>
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Nom</th>
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Role</th>
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Département</th>
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Poste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-slate-800">
                          <td className="py-2 px-3 text-seal-navy dark:text-white">{row.email}</td>
                          <td className="py-2 px-3 text-seal-navy dark:text-white">{row.firstName}</td>
                          <td className="py-2 px-3 text-seal-navy dark:text-white">{row.lastName}</td>
                          <td className="py-2 px-3"><Badge>{row.role}</Badge></td>
                          <td className="py-2 px-3 text-seal-gray-500">{row.department || '-'}</td>
                          <td className="py-2 px-3 text-seal-gray-500">{row.jobTitle || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validRows.length > 50 && (
                    <p className="text-xs text-seal-gray-500 mt-2">... et {validRows.length - 50} autres lignes</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Errors table */}
          {errors.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-amber-600 dark:text-amber-400 text-sm">Erreurs de validation</h2>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-slate-700">
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Ligne</th>
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Champ</th>
                        <th className="text-left py-2 px-3 text-seal-gray-500 font-medium">Erreur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((err, idx) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-slate-800">
                          <td className="py-2 px-3 text-seal-navy dark:text-white">{err.line}</td>
                          <td className="py-2 px-3 text-seal-navy dark:text-white">{err.field}</td>
                          <td className="py-2 px-3 text-amber-600 dark:text-amber-400">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={reset}>Annuler</Button>
            {validRows.length > 0 && (
              <Button onClick={handleImport} loading={importing}>
                <FileText className="h-4 w-4" />
                Confirmer l&apos;import ({validRows.length} utilisateur{validRows.length > 1 ? 's' : ''})
              </Button>
            )}
          </div>
        </>
      )}

      {/* Step 3: Done */}
      {step === 'done' && result && (
        <>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="py-6">
              <div className="flex items-center gap-4 mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <h2 className="text-lg font-medium text-seal-navy dark:text-white">Import terminé</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                  <p className="text-3xl font-semibold text-emerald-600">{result.created}</p>
                  <p className="text-xs text-seal-gray-500 mt-1">Comptes crees</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-3xl font-semibold text-amber-600">{result.skipped}</p>
                  <p className="text-xs text-seal-gray-500 mt-1">Ignores (doublons)</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <p className="text-3xl font-semibold text-red-600">{result.errors.length}</p>
                  <p className="text-xs text-seal-gray-500 mt-1">Erreurs</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-semibold text-red-600 mb-2">Details des erreurs :</p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {result.errors.map((e, idx) => (
                      <li key={idx}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={reset}>Nouvel import</Button>
            <Link href="/admin/users">
              <Button>Retour à la liste</Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
