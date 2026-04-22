"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/auth/form-field";
import { InlineAlert } from "@/components/auth/inline-alert";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session-context";
import { loginSchema, type LoginFormValues } from "@/lib/validation/auth-schemas";

const INPUT_CLASS =
  "w-full rounded-control border bg-surface-card px-3 py-2.5 text-sm text-foreground shadow-xs placeholder:text-foreground-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

export function LoginForm() {
  const router = useRouter();
  const { setEmail } = useSession();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  const onSubmit = async (data: LoginFormValues) => {
    setFormError(null);
    await new Promise((r) => setTimeout(r, 900));

    if (data.password === "wrong") {
      setFormError("Неверный email или пароль. Повторите попытку, либо используйте любой пароль кроме «wrong».");
      return;
    }

    setEmail(data.email.trim());
    router.push("/demo-router" as Route);
  };

  return (
    <div className="rounded-card border border-border-subtle bg-surface-card p-6 shadow-xs sm:p-8">
      {formError ? (
        <div className="mb-5">
          <InlineAlert variant="error" title="Ошибка входа">
            {formError}
          </InlineAlert>
        </div>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormField id="login-email" label="Рабочий email" error={errors.email?.message}>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            className={`${INPUT_CLASS} ${errors.email ? "border-danger" : "border-border-subtle"}`}
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </FormField>

        <FormField
          id="login-password"
          label="Пароль"
          error={errors.password?.message}
          hint="Подходит любой пароль, кроме «wrong» - он показывает состояние ошибки."
        >
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className={`${INPUT_CLASS} ${errors.password ? "border-danger" : "border-border-subtle"}`}
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </FormField>

        <Button type="submit" className="w-full py-3" loading={isSubmitting} loadingLabel="Вход…">
          Войти
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-foreground-secondary">
        Нет аккаунта?{" "}
        <Link href={"/register" as Route} className="font-semibold text-foreground hover:text-foreground-secondary hover:underline">
          Создать
        </Link>
      </p>
    </div>
  );
}
