import { AuthPageIntro } from "@/components/auth/auth-page-intro";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-8">
      <AuthPageIntro eyebrow="С возвращением" title="Вход в систему" />
      <LoginForm />
    </div>
  );
}
