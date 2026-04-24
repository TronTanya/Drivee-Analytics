import { AuthPageIntro } from "@/components/auth/auth-page-intro";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <AuthPageIntro
        eyebrow="С возвращением"
        title="Вход в ваш workspace"
        description="Доступ к сценариям, AI-инсайтам и ролевым дашбордам. Вход идёт через API бэкенда; демо-аккаунты и пароль задаются сидом (`make seed`, см. docs/demo-users-credentials.md)."
      />
      <LoginForm />
    </div>
  );
}
