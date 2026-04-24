"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormField } from "@/components/auth/form-field";
import { InlineAlert } from "@/components/auth/inline-alert";
import { Button } from "@/components/ui/button";
import { useRegister } from "@/hooks/api/use-auth";
import { useSession } from "@/lib/auth/session-context";
import type { UserRole } from "@/lib/types";
import { registerSchema, type RegisterFormValues } from "@/lib/validation/auth-schemas";

const INPUT_CLASS =
  "w-full rounded-control border bg-surface-card px-3 py-2.5 text-sm text-foreground shadow-xs placeholder:text-foreground-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: "admin", label: "Администратор", description: "Управление workspace и доступами" },
  { value: "manager", label: "Менеджер", description: "Командная аналитика и сценарии" },
  { value: "marketer", label: "Маркетолог", description: "Кампании и атрибуция" },
  { value: "executive", label: "Руководитель", description: "KPI и прогнозные сводки" }
];

export function RegisterForm() {
  const router = useRouter();
  const { setRole, setEmail } = useSession();
  const registerMutation = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      demoRole: "manager"
    }
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setFormError(null);
    setFormSuccess(false);
    try {
      const session = await registerMutation.mutateAsync({
        email: data.email.trim(),
        password: data.password,
        full_name: data.fullName.trim(),
        demo_role: data.demoRole
      });
      setRole(session.user.role);
      setEmail(session.user.email);
      setFormSuccess(true);
      router.push("/notebooks" as Route);
    } catch {
      setFormError("Не удалось создать аккаунт. Возможно, email уже используется.");
    }
  };

  return (
    <div className="rounded-card border border-border-subtle bg-surface-card p-6 shadow-xs sm:p-8">
      {formError ? (
        <div className="mb-5">
          <InlineAlert variant="error" title="Не удалось создать аккаунт">
            {formError}
          </InlineAlert>
        </div>
      ) : null}

      {formSuccess ? (
        <div className="mb-5">
          <InlineAlert variant="success" title="Аккаунт готов">
            Перенаправляем в ваш хаб…
          </InlineAlert>
        </div>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormField id="register-name" label="Полное имя" error={errors.fullName?.message}>
          <input
            id="register-name"
            autoComplete="name"
            className={`${INPUT_CLASS} ${errors.fullName ? "border-danger" : "border-border-subtle"}`}
            placeholder="Алексей Морозов"
            aria-invalid={!!errors.fullName}
            {...register("fullName")}
          />
        </FormField>

        <FormField
          id="register-email"
          label="Рабочий email"
          error={errors.email?.message}
          hint="Регистрация выполняется через backend API."
        >
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            className={`${INPUT_CLASS} ${errors.email ? "border-danger" : "border-border-subtle"}`}
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </FormField>

        <FormField id="register-password" label="Пароль" error={errors.password?.message}>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            className={`${INPUT_CLASS} ${errors.password ? "border-danger" : "border-border-subtle"}`}
            placeholder="Минимум 8 символов, хотя бы одна буква и одна цифра"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </FormField>

        <FormField id="register-confirm" label="Подтвердите пароль" error={errors.confirmPassword?.message}>
          <input
            id="register-confirm"
            type="password"
            autoComplete="new-password"
            className={`${INPUT_CLASS} ${errors.confirmPassword ? "border-danger" : "border-border-subtle"}`}
            placeholder="Повторите пароль"
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
        </FormField>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Демо-роль</p>
          <p className="text-xs text-foreground-muted">Выберите сценарий, который хотите изучить первым.</p>
          <Controller
            name="demoRole"
            control={control}
            render={({ field }) => (
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLE_OPTIONS.map((opt) => {
                  const selected = field.value === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`relative flex cursor-pointer flex-col rounded-control border px-3 py-3 transition focus-within:ring-2 focus-within:ring-brand-500/30 ${
                        selected
                          ? "border-brand-400 bg-brand-50 shadow-xs"
                          : "border-border-subtle bg-surface-card hover:border-brand-200 hover:bg-surface-muted/80"
                      }`}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        value={opt.value}
                        checked={selected}
                        onChange={() => field.onChange(opt.value)}
                        onBlur={field.onBlur}
                      />
                      <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                      <span className="mt-0.5 text-xs text-foreground-secondary">{opt.description}</span>
                    </label>
                  );
                })}
              </div>
            )}
          />
          {errors.demoRole?.message ? (
            <p className="text-xs font-medium text-danger">{errors.demoRole.message}</p>
          ) : null}
        </div>

        <Button
          type="submit"
          className="w-full py-3"
          loading={(isSubmitting || registerMutation.isPending) && !formSuccess}
          loadingLabel="Создание аккаунта…"
        >
          Создать аккаунт
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-foreground-secondary">
        Уже есть аккаунт?{" "}
        <Link href={"/login" as Route} className="font-semibold text-foreground hover:text-foreground-secondary hover:underline">
          Войти
        </Link>
      </p>
    </div>
  );
}
