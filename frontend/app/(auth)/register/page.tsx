import { AuthPageIntro } from "@/components/auth/auth-page-intro";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div className="space-y-8">
      <AuthPageIntro
        eyebrow="Начнем"
        title="Создание аккаунта"
        description="Выберите роль для первого сценария. Ее можно изменить в шапке приложения в любой момент."
      />
      <RegisterForm />
    </div>
  );
}
