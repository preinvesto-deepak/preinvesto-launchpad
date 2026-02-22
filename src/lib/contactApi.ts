export interface ContactFormData {
  name: string;
  email?: string;
  phone: string;
  service?: string;
  message: string;
}

export interface ContactApiResponse {
  success: boolean;
  message: string;
  errors?: string[];
}

export async function submitContactForm(data: ContactFormData): Promise<ContactApiResponse> {
  const res = await fetch("/send_contact_email.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json: ContactApiResponse = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.message || "Failed to send message. Please try again.");
  }

  return json;
}
