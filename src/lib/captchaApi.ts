export interface CaptchaChallenge {
  question: string;
  token: string;
}

export async function fetchCaptcha(): Promise<CaptchaChallenge> {
  const res = await fetch("/captcha.php");
  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.message || "Failed to load verification question.");
  }

  return { question: json.question, token: json.token };
}
