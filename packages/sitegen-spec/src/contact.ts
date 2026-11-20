// Phone helpers. Phones are stored E.164 (the database requires it).

const E164 = /^\+[1-9][0-9]{7,14}$/;

export const isE164 = (v: unknown): v is string =>
  typeof v === "string" && E164.test(v);

export const telHref = (phone: string) => `tel:${phone}`;
export const smsHref = (phone: string) => `sms:${phone}`;

/** "+17165550100" -> "(716) 555-0100". Other numbers are shown as stored. */
export function displayPhone(phone: string): string {
  const m = /^\+1([2-9][0-9]{2})([2-9][0-9]{2})([0-9]{4})$/.exec(phone);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}
