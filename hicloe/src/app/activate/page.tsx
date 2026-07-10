import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { ActivateForm } from "./activate-form";

export default function ActivatePage() {
  return (
    <main className="auth-wrap">
      <div className="card">
        <Logo size={56} className="mx-auto mb-4 drop-shadow-[0_8px_20px_rgba(33,88,209,0.35)]" />
        <h1 className="text-center">Activate your account</h1>
        <p className="sub text-center">Set a password to finish setting up your account</p>
        <Suspense>
          <ActivateForm />
        </Suspense>
      </div>
    </main>
  );
}
