"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Button,
  Input,
} from "@omnitech/ui";
import { Lock, Save, ChevronDown, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import {
  changePasswordSchema as passwordInputSchema,
  type ChangePasswordFormData,
} from "@/lib/validation/schemas";

type PasswordForm = ChangePasswordFormData;

export function ProfileChangePassword() {
  const { t } = useTranslation();
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordInputSchema),
    mode: "onTouched",
    defaultValues: { oldPassword: "", newPassword: "", confirmPassword: "" },
  });

  const watchedNewPassword = watch("newPassword") || "";

  const onChangePassword = async (data: PasswordForm) => {
    setChangingPassword(true);
    try {
      await api.post("/users/me/change-password", {
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
      });
      toast.success(t("profile.passwordChanged"));
      reset();
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Erreur";
      toast.error(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setShowPasswordSection(!showPasswordSection)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Modifier le mot de passe
          </h2>
          <ChevronDown
            className={`h-5 w-5 text-seal-gray-500 transition-transform ${showPasswordSection ? "rotate-180" : ""}`}
          />
        </button>
      </CardHeader>
      {showPasswordSection && (
        <form onSubmit={handleSubmit(onChangePassword)}>
          <CardContent className="space-y-3">
            <Input
              label={t("profile.currentPassword")}
              type="password"
              autoComplete="current-password"
              error={errors.oldPassword?.message}
              {...register("oldPassword")}
            />
            <Input
              label={t("profile.newPassword")}
              type="password"
              error={errors.newPassword?.message}
              {...register("newPassword")}
            />
            {watchedNewPassword &&
              (() => {
                const score =
                  (watchedNewPassword.length >= 12 ? 1 : 0) +
                  (/[A-Z]/.test(watchedNewPassword) ? 1 : 0) +
                  (/[0-9]/.test(watchedNewPassword) ? 1 : 0) +
                  (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(
                    watchedNewPassword,
                  )
                    ? 1
                    : 0);
                const barColors = [
                  "bg-red-500",
                  "bg-orange-500",
                  "bg-yellow-500",
                  "bg-green-500",
                ];
                const labels = [
                  "Faible",
                  "Faible",
                  "Moyen",
                  "Fort",
                  "Excellent",
                ];
                const labelColors = [
                  "text-red-500",
                  "text-red-500",
                  "text-orange-500",
                  "text-yellow-600",
                  "text-green-600",
                ];
                return (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                              i < score
                                ? barColors[score - 1]
                                : "bg-gray-200 dark:bg-slate-700"
                            }`}
                          />
                        ))}
                      </div>
                      <span
                        className={`text-[11px] font-semibold ${labelColors[score]}`}
                      >
                        {labels[score]}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {[
                        {
                          test: watchedNewPassword.length >= 12,
                          label: "12 caractères minimum",
                        },
                        {
                          test: /[A-Z]/.test(watchedNewPassword),
                          label: "Une majuscule",
                        },
                        {
                          test: /[a-z]/.test(watchedNewPassword),
                          label: "Une minuscule",
                        },
                        {
                          test: /[0-9]/.test(watchedNewPassword),
                          label: "Un chiffre",
                        },
                        {
                          test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(
                            watchedNewPassword,
                          ),
                          label: "Un caractère spécial",
                        },
                      ].map(({ test, label }) => (
                        <div
                          key={label}
                          className={`flex items-center gap-1.5 text-xs ${test ? "text-emerald-600" : "text-seal-gray-500 dark:text-slate-400"}`}
                        >
                          {test ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <div className="h-3 w-3 rounded-full border border-gray-300 dark:border-slate-600" />
                          )}
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            <Input
              label={t("profile.confirmPassword")}
              type="password"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />
          </CardContent>
          <CardFooter>
            <div className="flex justify-end">
              <Button
                type="submit"
                loading={changingPassword || isSubmitting}
                disabled={changingPassword || isSubmitting || !isValid}
              >
                <Save className="h-4 w-4" />
                {changingPassword ? "Modification…" : "Modifier"}
              </Button>
            </div>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
