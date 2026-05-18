import { FormEvent, useState } from "react";
import { ArrowLeft, LockKeyhole, LogIn } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { adminLogin } from "../api/client";

interface AdminLoginPageProps {
  onLogin: () => Promise<void>;
}

export function AdminLoginPage({ onLogin }: AdminLoginPageProps) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminLogin(password);
      await onLogin();
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page adminLoginPage">
      <section className="loginPanel">
        <Link className="loginBackLink" to="/matches">
          <ArrowLeft size={16} />
          Public matches
        </Link>
        <div className="loginIcon">
          <LockKeyhole size={26} />
        </div>
        <div>
          <span className="eyebrow">Admin access</span>
          <h1>Admin login</h1>
          <p>Admin area controls uploads, parser jobs, rescans, reparses and destructive actions.</p>
        </div>
        <form onSubmit={handleSubmit} className="loginForm">
          <label>
            <span>Password</span>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Admin password"
            />
          </label>
          {error ? <div className="notice danger">{error}</div> : null}
          <button className="primaryButton" type="submit" disabled={submitting || !password}>
            <LogIn size={17} />
            {submitting ? "Signing in" : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
