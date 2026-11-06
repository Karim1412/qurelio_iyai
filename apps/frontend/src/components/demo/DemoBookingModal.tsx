'use client';

import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { QurelioPhoneInput } from '@/components/ui/phone-input';
import { ArrowLeft, ArrowRight, Calendar, Check, Loader2 } from '@/components/icons';
import { demoApi, type DemoSlotPublic } from '@/lib/api';
import {
  EA_CERTIFICATIONS, EA_CHALLENGES, EA_COMPANY_SIZES, EA_COMPLIANCE_TODAY,
  EA_CONSULTING_SCOPES, EA_CONTACT_EMAIL, EA_DECISION_ROLES, EA_INDUSTRIES,
  EA_LANGUAGES, EA_LEGAL_ENTITY, EA_MARKETS, EA_MAX_CHALLENGES,
  EA_PERSONAL_EMAIL_DOMAINS, EA_PILOT_ANSWERS, EA_PRODUCT_COUNTS,
  EA_RESPONSE_HOURS, EA_ROLES, EA_TIMELINES,
} from '@/components/demo/demo-form-options';
import { cn } from '@/utils/cn';

export function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

interface FormState {
  fullName: string;
  email: string;
  companyName: string;
  role: string;
  roleOther: string;
  phone: string;
  field: string;
  consultingScope: string;
  companyCapacity: string;
  marketsActive: string[];
  marketsTargeting: string[];
  certifications: string[];
  certificationsOther: string;
  productCount: string;
  complianceToday: string;
  qmsName: string;
  challenges: string[];
  challengesOther: string;
  timeline: string;
  decisionRole: string;
  pilotInterest: string;
  description: string;
  preferredLanguage: string;
  consentContact: boolean;
  consentMarketing: boolean;
}

const EMPTY: FormState = {
  fullName: '', email: '', companyName: '', role: '', roleOther: '', phone: '',
  field: '', consultingScope: '', companyCapacity: '',
  marketsActive: [], marketsTargeting: [], certifications: [], certificationsOther: '',
  productCount: '', complianceToday: '', qmsName: '', challenges: [], challengesOther: '',
  timeline: '', decisionRole: '', pilotInterest: '', description: '', preferredLanguage: '',
  consentContact: false, consentMarketing: false,
};

const STEPS = ['You & your company', 'Your regulatory context', 'Your priorities & your demo'];

function Question({
  n, label, required, help, children,
}: { n: number; label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="mb-0 flex items-start gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
        <span className="text-[var(--brand-primary)]">{n}.</span>
        <span>
          {label}
          {required ? <span className="text-red-500"> *</span> : (
            <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">Optional</span>
          )}
        </span>
      </Label>
      {help && <p className="text-[11px] leading-relaxed text-[var(--muted)]">{help}</p>}
      {children}
    </div>
  );
}

function ChoiceList({
  options, value, onChange, name,
}: { options: string[]; value: string; onChange: (v: string) => void; name: string }) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => (
        <label
          key={o}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2 text-[13px] transition-all duration-150',
            value === o
              ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]'
              : 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40',
          )}
        >
          <input
            type="radio" name={name} checked={value === o} onChange={() => onChange(o)}
            className="mt-0.5 shrink-0 accent-[var(--brand-primary)]"
          />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

function CheckList({
  options, values, onToggle, disabledWhenFull,
}: { options: string[]; values: string[]; onToggle: (v: string) => void; disabledWhenFull?: boolean }) {
  return (
    <div className="space-y-1.5">
      {options.map((o) => {
        const checked = values.includes(o);
        const blocked = !!disabledWhenFull && !checked;
        return (
          <label
            key={o}
            className={cn(
              'flex items-start gap-3 rounded-xl border px-3.5 py-2 text-[13px] transition-all duration-150',
              blocked ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
              checked
                ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]'
                : 'border-[var(--input-border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40',
            )}
          >
            <input
              type="checkbox" checked={checked} disabled={blocked} onChange={() => onToggle(o)}
              className="mt-0.5 shrink-0 accent-[var(--brand-primary)]"
            />
            <span>{o}</span>
          </label>
        );
      })}
    </div>
  );
}

interface Props {
  slot: DemoSlotPublic | null;
  onClose: () => void;
  onBooked: (pilot: boolean) => void;
}

/**
 * Booking popup: the Early Access questionnaire.
 *
 * Picking a slot and qualifying happen in one step, so a booking and its answers
 * are a single request the admin sees in one list.
 */
export function DemoBookingModal({ slot, onClose, onBooked }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));
  const toggle = (k: 'marketsActive' | 'marketsTargeting' | 'certifications' | 'challenges', v: string) =>
    setForm((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  const personalEmailHint = useMemo(() => {
    const domain = form.email.split('@')[1]?.toLowerCase() ?? '';
    return EA_PERSONAL_EMAIL_DOMAINS.some((d) => domain.startsWith(`${d}.`));
  }, [form.email]);

  const isConsultant = form.role === 'Quality & regulatory consultant';

  const stepError = (s: number): string | null => {
    if (s === 0) {
      if (form.fullName.trim().length < 2) return 'Enter your first and last name';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return 'Enter a valid work email';
      if (form.companyName.trim().length < 2) return 'Enter your company name';
      if (!form.role) return 'Select your role';
      if (form.role === 'Other' && !form.roleOther.trim()) return 'Please specify your role';
      if (isConsultant && !form.consultingScope) {
        return 'Tell us whether this is for your own firm, your clients, or both';
      }
      return null;
    }
    if (s === 1) {
      if (!form.field) return 'Select your primary industry';
      if (!form.companyCapacity) return 'Select your company size';
      if (form.marketsActive.length === 0 && form.marketsTargeting.length === 0) {
        return 'Select at least one market you are active in or targeting';
      }
      if (form.certifications.includes('Other') && !form.certificationsOther.trim()) {
        return 'Please specify the other certification';
      }
      return null;
    }
    if (!form.complianceToday) return 'Tell us how you manage compliance today';
    if (form.complianceToday === 'A QMS or eQMS already in place' && !form.qmsName.trim()) {
      return 'Which QMS or eQMS do you use?';
    }
    if (form.challenges.length === 0) return 'Select at least one challenge';
    if (form.challenges.includes('Other') && !form.challengesOther.trim()) {
      return 'Please specify the other challenge';
    }
    if (!form.timeline) return 'Select when you want a solution in place';
    if (!form.decisionRole) return 'Select your role in the decision';
    if (!form.pilotInterest) return 'Tell us about the pilot programme';
    if (!form.consentContact) return 'Consent is required to process your request';
    return null;
  };

  const close = () => {
    if (submitting) return;
    onClose();
    setTimeout(() => { setForm(EMPTY); setStep(0); }, 220);
  };

  const next = () => {
    const err = stepError(step);
    if (err) return toast.error(err);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!slot) return;
    const err = stepError(2);
    if (err) return toast.error(err);
    setSubmitting(true);
    try {
      await demoApi.book({
        slotId: slot.id,
        ...form,
        roleOther: form.roleOther.trim() || undefined,
        phone: form.phone.trim() || undefined,
        consultingScope: form.consultingScope || undefined,
        certifications: form.certifications.length ? form.certifications : undefined,
        certificationsOther: form.certificationsOther.trim() || undefined,
        productCount: form.productCount || undefined,
        qmsName: form.qmsName.trim() || undefined,
        challengesOther: form.challengesOther.trim() || undefined,
        description: form.description.trim() || undefined,
        preferredLanguage: form.preferredLanguage || undefined,
      });
      onBooked(form.pilotInterest.startsWith('Yes'));
      setForm(EMPTY);
      setStep(0);
    } catch (e: any) {
      const raw = e?.response?.data?.message ?? 'Could not send your request';
      toast.error(Array.isArray(raw) ? raw[0] : String(raw));
      // 409 means someone took the slot while the form was open.
      if (e?.response?.status === 409) onBooked(false);
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <Dialog open={!!slot} onOpenChange={(v) => !v && close()}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col overflow-hidden p-0">
        <div className="border-b border-[var(--border)] px-6 pb-4 pt-5">
          <DialogHeader>
            <DialogTitle>Book your demo</DialogTitle>
            <DialogDescription className="text-[13px]">
              These few questions help us prepare a demo that fits your actual business rather than a
              generic walkthrough.
            </DialogDescription>
          </DialogHeader>

          {slot && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/5 p-3">
              <Calendar className="h-5 w-5 shrink-0 text-[var(--brand-primary)]" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{formatSlot(slot.startsAt)}</p>
                <p className="text-[11px] text-[var(--muted)]">
                  {slot.durationMinutes} minutes · shown in your local time
                </p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[var(--muted)]">
              <span>Step {step + 1} of {STEPS.length}: {STEPS[step]}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nav-hover)]">
              <div className="h-full bg-[var(--brand-primary)] transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <>
              <Question n={1} label="First and last name" required>
                <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Your name" />
              </Question>

              <Question n={2} label="Your work email" required help="We send no newsletters and no automated prospecting.">
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@company.com" />
                {personalEmailHint && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
                    A work address helps us prepare your demo, but this one is fine if it is the
                    address you actually work from.
                  </p>
                )}
              </Question>

              <Question n={3} label="Company name" required>
                <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Your company" />
              </Question>

              <Question n={4} label="Your role" required>
                <ChoiceList name="role" options={EA_ROLES} value={form.role} onChange={(v) => set('role', v)} />
                {form.role === 'Other' && (
                  <div className="mt-2.5">
                    <Label className="text-[12px]">Please specify your role <span className="text-red-500">*</span></Label>
                    <Input value={form.roleOther} onChange={(e) => set('roleOther', e.target.value)} />
                  </div>
                )}
                {isConsultant && (
                  <div className="mt-3 rounded-xl border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/5 p-3.5">
                    <Label className="text-[12px] font-semibold">
                      Are you looking at Qurelio for your own firm, for your clients, or both?{' '}
                      <span className="text-red-500">*</span>
                    </Label>
                    <div className="mt-2">
                      <ChoiceList name="consultingScope" options={EA_CONSULTING_SCOPES} value={form.consultingScope} onChange={(v) => set('consultingScope', v)} />
                    </div>
                  </div>
                )}
              </Question>

              <Question n={5} label="Phone / WhatsApp" help="So we can agree on a slot faster. Include the country code, e.g. +216 XX XXX XXX.">
                <QurelioPhoneInput value={form.phone || undefined} onChange={(v) => set('phone', v ?? '')} />
              </Question>
            </>
          )}

          {step === 1 && (
            <>
              <Question n={6} label="Field / Industry" required>
                <ChoiceList name="field" options={EA_INDUSTRIES} value={form.field} onChange={(v) => set('field', v)} />
              </Question>

              <Question n={7} label="Company size" required>
                <ChoiceList name="companyCapacity" options={EA_COMPANY_SIZES} value={form.companyCapacity} onChange={(v) => set('companyCapacity', v)} />
              </Question>

              <Question n={8} label="Markets you are already active in" required help="At least one selection across both market lists.">
                <CheckList options={EA_MARKETS} values={form.marketsActive} onToggle={(v) => toggle('marketsActive', v)} />
              </Question>

              <Question n={8} label="Markets you are targeting within 12–24 months">
                <CheckList options={EA_MARKETS} values={form.marketsTargeting} onToggle={(v) => toggle('marketsTargeting', v)} />
              </Question>

              <Question n={9} label="Certifications or standards you hold or are pursuing">
                <CheckList options={EA_CERTIFICATIONS} values={form.certifications} onToggle={(v) => toggle('certifications', v)} />
                {form.certifications.includes('Other') && (
                  <div className="mt-2.5">
                    <Label className="text-[12px]">Please specify <span className="text-red-500">*</span></Label>
                    <Input value={form.certificationsOther} onChange={(e) => set('certificationsOther', e.target.value)} />
                  </div>
                )}
              </Question>

              <Question n={10} label="How many products or references do you manage?">
                <ChoiceList name="productCount" options={EA_PRODUCT_COUNTS} value={form.productCount} onChange={(v) => set('productCount', v)} />
              </Question>
            </>
          )}

          {step === 2 && (
            <>
              <Question n={11} label="How do you manage compliance today?" required>
                <ChoiceList name="complianceToday" options={EA_COMPLIANCE_TODAY} value={form.complianceToday} onChange={(v) => set('complianceToday', v)} />
                {form.complianceToday === 'A QMS or eQMS already in place' && (
                  <div className="mt-2.5">
                    <Label className="text-[12px]">Which one? <span className="text-red-500">*</span></Label>
                    <Input value={form.qmsName} onChange={(e) => set('qmsName', e.target.value)} />
                  </div>
                )}
              </Question>

              <Question
                n={12}
                label={`Your main day-to-day challenges (${EA_MAX_CHALLENGES} answers maximum)`}
                required
                help={`${form.challenges.length} of ${EA_MAX_CHALLENGES} selected`}
              >
                <CheckList
                  options={EA_CHALLENGES}
                  values={form.challenges}
                  onToggle={(v) => toggle('challenges', v)}
                  disabledWhenFull={form.challenges.length >= EA_MAX_CHALLENGES}
                />
                {form.challenges.includes('Other') && (
                  <div className="mt-2.5">
                    <Label className="text-[12px]">Please specify <span className="text-red-500">*</span></Label>
                    <Input value={form.challengesOther} onChange={(e) => set('challengesOther', e.target.value)} />
                  </div>
                )}
              </Question>

              <Question n={13} label="When do you want a solution in place?" required>
                <ChoiceList name="timeline" options={EA_TIMELINES} value={form.timeline} onChange={(v) => set('timeline', v)} />
              </Question>

              <Question n={14} label="Your role in this decision" required>
                <ChoiceList name="decisionRole" options={EA_DECISION_ROLES} value={form.decisionRole} onChange={(v) => set('decisionRole', v)} />
              </Question>

              <Question
                n={15}
                label="Would you like to join the pilot programme?"
                required
                help="Early access, preferential launch pricing, and regular sessions with the product team to help shape what comes next."
              >
                <ChoiceList name="pilotInterest" options={EA_PILOT_ANSWERS} value={form.pilotInterest} onChange={(v) => set('pilotInterest', v)} />
              </Question>

              <Question
                n={16}
                label="Anything specific you'd like to see during the demo?"
                help="A concrete case, a regulatory text, a specific bottleneck. We'll build the demo around it."
              >
                <Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </Question>

              <Question n={17} label="Preferred language for the demo">
                <ChoiceList name="preferredLanguage" options={EA_LANGUAGES} value={form.preferredLanguage} onChange={(v) => set('preferredLanguage', v)} />
              </Question>

              <Question n={18} label="Consent" required>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3.5 py-2.5 text-[12px] leading-relaxed">
                  <input
                    type="checkbox" checked={form.consentContact}
                    onChange={(e) => set('consentContact', e.target.checked)}
                    className="mt-0.5 shrink-0 accent-[var(--brand-primary)]"
                  />
                  <span>
                    I agree that {EA_LEGAL_ENTITY}, publisher of Qurelio, may use the information
                    provided to prepare and schedule my demo and to contact me about it. This data is
                    neither sold nor shared with third parties. I may request its correction or
                    deletion at any time at {EA_CONTACT_EMAIL}.<span className="text-red-500"> *</span>
                  </span>
                </label>
                <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--input-border)] bg-[var(--surface)] px-3.5 py-2.5 text-[12px] leading-relaxed">
                  <input
                    type="checkbox" checked={form.consentMarketing}
                    onChange={(e) => set('consentMarketing', e.target.checked)}
                    className="mt-0.5 shrink-0 accent-[var(--brand-primary)]"
                  />
                  <span>
                    I&apos;d like to receive Qurelio product news and regulatory updates.
                    <span className="ml-1 text-[var(--muted)]">(optional)</span>
                  </span>
                </label>
              </Question>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-3">
          <p className="hidden text-[11px] text-[var(--muted)] sm:block">
            We reply within {EA_RESPONSE_HOURS} hours. Your slot is held until then.
          </p>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={submitting} className="gap-2">
                <ArrowLeft className="h-4 w-4" />Previous
              </Button>
            ) : (
              <Button variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={next} className="gap-2">
                Continue<ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Send my request
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
