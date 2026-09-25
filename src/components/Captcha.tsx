import { useEffect, useState } from "react";
import { fetchCaptcha } from "@/lib/captchaApi";

export interface CaptchaValue {
  token: string;
  answer: string;
}

interface CaptchaProps {
  value: CaptchaValue;
  onChange: (value: CaptchaValue) => void;
  idPrefix?: string;
}

const Captcha = ({ value, onChange, idPrefix = "captcha" }: CaptchaProps) => {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const challenge = await fetchCaptcha();
      setQuestion(challenge.question);
      onChange({ token: challenge.token, answer: "" });
    } catch (err: any) {
      setError(err.message || "Could not load verification question.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputId = `${idPrefix}-answer`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-1.5">
        {loading ? "Loading verification question…" : `Quick check: what is ${question}? *`}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          disabled={loading}
          value={value.answer}
          onChange={(e) => onChange({ ...value, answer: e.target.value })}
          className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition disabled:opacity-60"
          placeholder="Your answer"
        />
        <button
          type="button"
          onClick={load}
          title="Get a new question"
          aria-label="Get a new verification question"
          className="shrink-0 px-3 py-3 rounded-lg border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm"
        >
          ↻
        </button>
      </div>
      {error && <p className="text-destructive text-xs mt-1">{error}</p>}
    </div>
  );
};

export default Captcha;
