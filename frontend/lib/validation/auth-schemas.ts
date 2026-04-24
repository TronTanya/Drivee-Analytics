import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "Введите email").email("Введите корректный email"),
  /** Логин не должен дублировать правила регистрации: демо-пароль из сида — `demo123` (7 символов). */
  password: z.string().min(1, "Введите пароль")
});

export const registerSchema = z
  .object({
    fullName: z.string().min(2, "Минимум 2 символа").max(120, "Слишком длинное значение"),
    email: z.string().min(1, "Введите email").email("Введите корректный email"),
    password: z
      .string()
      .min(8, "Используйте не менее 8 символов")
      .regex(/[A-Za-z]/, "Добавьте хотя бы одну букву")
      .regex(/[0-9]/, "Добавьте хотя бы одну цифру"),
    confirmPassword: z.string().min(1, "Подтвердите пароль"),
    demoRole: z.enum(["admin", "manager", "marketer", "executive"], {
      message: "Выберите роль"
    })
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"]
  });

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
