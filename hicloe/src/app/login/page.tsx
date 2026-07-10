import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-wrap">
      <div className="card">
        <Logo size={56} className="mx-auto mb-4 drop-shadow-[0_8px_20px_rgba(33,88,209,0.35)]" />
        <h1 className="text-center">HiLCoE Scheduler</h1>
        <p className="sub text-center">Sign in with your registered account</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
