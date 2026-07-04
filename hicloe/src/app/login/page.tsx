import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-wrap">
      <div className="card">
        <h1>HiLCoE Scheduler</h1>
        <p className="sub">Sign in with your registered account</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
