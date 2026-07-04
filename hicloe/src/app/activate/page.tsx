import { Suspense } from "react";
import { ActivateForm } from "./activate-form";

export default function ActivatePage() {
  return (
    <main className="auth-wrap">
      <div className="card">
        <h1>Activate your account</h1>
        <p className="sub">Set a password to finish setting up your account</p>
        <Suspense>
          <ActivateForm />
        </Suspense>
      </div>
    </main>
  );
}
