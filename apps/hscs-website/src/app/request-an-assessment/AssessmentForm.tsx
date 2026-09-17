"use client";

import { useActionState } from "react";
import {
  OPERATION_TYPES,
  PRIMARY_CONCERNS,
  OPERATION_SCALES,
  LIMITS,
  type FieldErrors,
  type RawRequest,
} from "@/lib/assessment-request";
import type { SubmitState } from "@/lib/submit-request";
import { submitAssessmentRequest } from "./actions";

const initial: SubmitState = { status: "idle" };

function errorsOf(state: SubmitState): FieldErrors {
  return state.status === "error" ? state.errors : {};
}
function valuesOf(state: SubmitState): RawRequest {
  return state.status === "error" ? state.values : {};
}

/** A field's error message id, so the input can point at it for screen readers. */
const errId = (name: string) => `${name}-error`;

function Error({ name, errors }: { name: keyof FieldErrors; errors: FieldErrors }) {
  const message = errors[name];
  if (!message) return null;
  return (
    <strong className="field__error" id={errId(name)}>
      {message}
    </strong>
  );
}

/**
 * The assessment intake form.
 *
 * Progressive enhancement: this is a real <form> bound to a server action, so
 * it submits and validates with JavaScript disabled. Nothing here is decorative
 * — every control posts a value the server reads.
 *
 * Only four things are required: the company, who you are, your email, and the
 * two consents. Everything else is explicitly optional, because the spec asks
 * for minimum friction and because an operator who cannot yet name their
 * problem is exactly who the assessment is for.
 */
export function AssessmentForm() {
  const [state, action, pending] = useActionState(submitAssessmentRequest, initial);
  const errors = errorsOf(state);
  const values = valuesOf(state);
  const formError = state.status === "error" ? state.formError : undefined;
  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form className="form" action={action} noValidate>
      {/* Announced to assistive technology the moment a refusal renders. */}
      <div aria-live="polite">
        {formError ? (
          <div className="notice notice--error" role="alert">
            <p className="notice__title">Your request wasn&rsquo;t sent</p>
            <p className="notice__body">{formError}</p>
          </div>
        ) : null}
        {hasFieldErrors ? (
          <div className="notice notice--error" role="alert">
            <p className="notice__title">A few things need checking</p>
            <p className="notice__body">
              Nothing was sent yet. The fields below are marked — everything you typed
              is still here.
            </p>
          </div>
        ) : null}
      </div>

      <input type="hidden" name="sourcePage" value="/request-an-assessment" />

      {/* Hidden from people and from assistive technology; only fillers reach it. */}
      <div className="trap" aria-hidden="true">
        <label htmlFor="companyWebsite">Company website (leave this empty)</label>
        <input
          id="companyWebsite"
          name="companyWebsite"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="companyName">
          Company
        </label>
        <input
          className="field__control"
          id="companyName"
          name="companyName"
          type="text"
          required
          maxLength={LIMITS.companyName}
          autoComplete="organization"
          defaultValue={values.companyName ?? ""}
          aria-invalid={errors.companyName ? true : undefined}
          aria-describedby={errors.companyName ? errId("companyName") : undefined}
        />
        <Error name="companyName" errors={errors} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="contactName">
          Your name
        </label>
        <input
          className="field__control"
          id="contactName"
          name="contactName"
          type="text"
          required
          maxLength={LIMITS.contactName}
          autoComplete="name"
          defaultValue={values.contactName ?? ""}
          aria-invalid={errors.contactName ? true : undefined}
          aria-describedby={errors.contactName ? errId("contactName") : undefined}
        />
        <Error name="contactName" errors={errors} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="email">
          Email
        </label>
        <input
          className="field__control"
          id="email"
          name="email"
          type="email"
          required
          maxLength={LIMITS.email}
          autoComplete="email"
          defaultValue={values.email ?? ""}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? errId("email") : undefined}
        />
        <Error name="email" errors={errors} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="phone">
          Phone <span className="field__optional">(optional)</span>
        </label>
        <input
          className="field__control"
          id="phone"
          name="phone"
          type="tel"
          maxLength={LIMITS.phone}
          autoComplete="tel"
          defaultValue={values.phone ?? ""}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? errId("phone") : undefined}
        />
        <Error name="phone" errors={errors} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="role">
          Your role <span className="field__optional">(optional)</span>
        </label>
        <input
          className="field__control"
          id="role"
          name="role"
          type="text"
          maxLength={LIMITS.role}
          autoComplete="organization-title"
          defaultValue={values.role ?? ""}
          aria-invalid={errors.role ? true : undefined}
          aria-describedby={errors.role ? errId("role") : undefined}
        />
        <Error name="role" errors={errors} />
      </div>

      <fieldset className="fieldset">
        <legend className="fieldset__legend">
          What do you run?{" "}
          <span className="field__optional">(optional — tick any)</span>
        </legend>
        <div className="choices choices--two">
          {OPERATION_TYPES.map((o) => (
            <label className="choice" key={o.value} htmlFor={`type-${o.value}`}>
              <input
                className="choice__input"
                id={`type-${o.value}`}
                type="checkbox"
                name="operationTypes"
                value={o.value}
                defaultChecked={values.operationTypes?.includes(o.value) ?? false}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor="operationScale">
          Roughly how big is the operation?{" "}
          <span className="field__optional">(optional)</span>
        </label>
        <select
          className="field__control"
          id="operationScale"
          name="operationScale"
          defaultValue={values.operationScale ?? ""}
          aria-invalid={errors.operationScale ? true : undefined}
          aria-describedby={errors.operationScale ? errId("operationScale") : undefined}
        >
          <option value="">Choose one</option>
          {OPERATION_SCALES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Error name="operationScale" errors={errors} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="primaryConcern">
          Where does it hurt most? <span className="field__optional">(optional)</span>
        </label>
        <span className="field__hint">
          These are the domains the assessment scores. &ldquo;Not sure&rdquo; is a real
          answer.
        </span>
        <select
          className="field__control"
          id="primaryConcern"
          name="primaryConcern"
          defaultValue={values.primaryConcern ?? ""}
          aria-invalid={errors.primaryConcern ? true : undefined}
          aria-describedby={errors.primaryConcern ? errId("primaryConcern") : undefined}
        >
          <option value="">Choose one</option>
          {PRIMARY_CONCERNS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Error name="primaryConcern" errors={errors} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="whatPrompted">
          What prompted this? <span className="field__optional">(optional)</span>
        </label>
        <span className="field__hint">
          The specific thing that made today the day you looked. It is the most useful
          thing you can tell us.
        </span>
        <textarea
          className="field__control"
          id="whatPrompted"
          name="whatPrompted"
          maxLength={LIMITS.whatPrompted}
          rows={5}
          defaultValue={values.whatPrompted ?? ""}
          aria-invalid={errors.whatPrompted ? true : undefined}
          aria-describedby={errors.whatPrompted ? errId("whatPrompted") : undefined}
        />
        <Error name="whatPrompted" errors={errors} />
      </div>

      <fieldset className="fieldset">
        <legend className="fieldset__legend">Before you send</legend>
        <div className="choices">
          <label className="choice choice--consent" htmlFor="consentPrivacy">
            <input
              className="choice__input"
              id="consentPrivacy"
              type="checkbox"
              name="consentPrivacy"
              defaultChecked={values.consentPrivacy ?? false}
              aria-invalid={errors.consentPrivacy ? true : undefined}
              aria-describedby={
                errors.consentPrivacy ? errId("consentPrivacy") : undefined
              }
            />
            <span>
              I understand HSCS will store what I&rsquo;ve entered in order to respond
              to this request, and will not sell it or pass it to anyone else.
            </span>
          </label>
          <Error name="consentPrivacy" errors={errors} />

          <label className="choice choice--consent" htmlFor="consentContact">
            <input
              className="choice__input"
              id="consentContact"
              type="checkbox"
              name="consentContact"
              defaultChecked={values.consentContact ?? false}
              aria-invalid={errors.consentContact ? true : undefined}
              aria-describedby={
                errors.consentContact ? errId("consentContact") : undefined
              }
            />
            <span>HSCS may contact me about this request.</span>
          </label>
          <Error name="consentContact" errors={errors} />
        </div>
      </fieldset>

      <div className="form__submit">
        <button className="btn btn--primary btn--lg" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send my request"}
        </button>
        <p className="form__footnote">
          Neither box is ticked for you. Requesting an assessment is a conversation, not
          a commitment.
        </p>
      </div>
    </form>
  );
}
