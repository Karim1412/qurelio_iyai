import React from 'react';

/**
 * Sidebar tab illustrations: ultra-calm edition.
 *
 * Design intent (relaxing, uncluttered):
 *   - ONE clear silhouette per icon, nothing else
 *   - no interior patterns (no windows / bars / grid lines / gear teeth)
 *   - at most one tiny accent, only when it carries the meaning
 *   - every corner & line-end rounded (caps/joins inherited from <svg>)
 *   - thin uniform stroke, soft single-level tint fill
 *   - everything in `currentColor`
 *
 * API: { size, strokeWidth?, className }: parity with the icon wrapper.
 */

export type SidebarIllustrationProps = {
  size?: number;
  strokeWidth?: number;
  className?: string;
};

const Svg = ({
  size = 22,
  className,
  children,
}: SidebarIllustrationProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
    // Round caps + joins applied once here; cascade to every child.
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const S = 1.4;        // single uniform stroke
const TINT = 0.12;    // soft background tint

/* ───── My Dashboard: 4 calm tiles ───── */
export const DashboardIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="3" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <rect x="13" y="3.5" width="7.5" height="7.5" rx="3" stroke="currentColor" strokeWidth={S} />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="3" stroke="currentColor" strokeWidth={S} />
    <rect x="13" y="13" width="7.5" height="7.5" rx="3" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── My File Library: folder ───── */
export const FileLibraryIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M3 8 A2.5 2.5 0 0 1 5.5 5.5 H9.5 L11.5 7.5 H18.5 A2.5 2.5 0 0 1 21 10 V17.5 A2.5 2.5 0 0 1 18.5 20 H5.5 A2.5 2.5 0 0 1 3 17.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── File Manager: folder with a real cog centered on its body ───── */
export const FileManagerIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    {/* Folder body */}
    <path d="M3 8 A2.5 2.5 0 0 1 5.5 5.5 H9.5 L11.5 7.5 H18.5 A2.5 2.5 0 0 1 21 10 V17.5 A2.5 2.5 0 0 1 18.5 20 H5.5 A2.5 2.5 0 0 1 3 17.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    {/* Real cog at the center of the folder body: 8 rounded teeth, ring, hub */}
    <g transform="translate(12 14)">
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" />
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" transform="rotate(45)" />
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" transform="rotate(90)" />
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" transform="rotate(135)" />
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" transform="rotate(180)" />
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" transform="rotate(225)" />
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" transform="rotate(270)" />
      <rect x="-0.62" y="-3.85" width="1.24" height="1.35" rx="0.4" fill="currentColor" transform="rotate(315)" />
      <circle r="2.7" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
      <circle r="1" fill="currentColor" />
    </g>
  </Svg>
);

/* ───── My Company: office building (HQ) ───── */
export const CompanyIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    {/* Main office tower */}
    <path d="M5 21 V6.5 A1.5 1.5 0 0 1 6.5 5 H13.5 A1.5 1.5 0 0 1 15 6.5 V21 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    {/* Lower side wing */}
    <path d="M15 21 V11 H18.5 A1.5 1.5 0 0 1 20 12.5 V21 Z" stroke="currentColor" strokeWidth={S} />
    {/* Window rows: soft, evenly spaced */}
    <line x1="7.5" y1="8.5" x2="9" y2="8.5" stroke="currentColor" strokeWidth={S} />
    <line x1="11" y1="8.5" x2="12.5" y2="8.5" stroke="currentColor" strokeWidth={S} />
    <line x1="7.5" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth={S} />
    <line x1="11" y1="12" x2="12.5" y2="12" stroke="currentColor" strokeWidth={S} />
    <line x1="17" y1="14.5" x2="18" y2="14.5" stroke="currentColor" strokeWidth={S} />
    {/* Entrance door */}
    <path d="M8.75 21 V16.5 A1.25 1.25 0 0 1 11.25 16.5 V21" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Kanban: 3 calm columns ───── */
export const KanbanIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="5" height="16" rx="2" stroke="currentColor" strokeWidth={S} />
    <rect x="9.5" y="4" width="5" height="16" rx="2" stroke="currentColor" strokeWidth={S} />
    <rect x="16" y="4" width="5" height="16" rx="2" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Calendar: soft frame ───── */
export const CalendarIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3.5" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke="currentColor" strokeWidth={S} />
    <line x1="8" y1="3.5" x2="8" y2="6.5" stroke="currentColor" strokeWidth={S} />
    <line x1="16" y1="3.5" x2="16" y2="6.5" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Training: graduation cap ───── */
export const TrainingIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M2 8.5 L12 3 L22 8.5 L12 14 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M5.5 10.5 V16.5 C5.5 19 8.5 21 12 21 C15.5 21 18.5 19 18.5 16.5 V10.5" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Analytics: single soft trend line ───── */
export const AnalyticsIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M4.5 4 V19.5 H20" stroke="currentColor" strokeWidth={S} />
    <path d="M7.5 16 L11 12 L14 14.5 L19 8.5" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Products Management: box ───── */
export const ProductsIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M12 3.5 L19.5 7.5 V16.5 L12 20.5 L4.5 16.5 V7.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M4.5 7.5 L12 11.5 L19.5 7.5 M12 11.5 V20" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Standards & Regulations: book ───── */
export const StandardsIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M4 5.5 H10 A2 2 0 0 1 12 7.5 V19.5 A2 2 0 0 0 10 17.5 H4 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M20 5.5 H14 A2 2 0 0 0 12 7.5 V19.5 A2 2 0 0 1 14 17.5 H20 Z" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Compliance Engine: shield with check ───── */
export const ComplianceIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M12 3.5 L19.5 6.5 V12 C19.5 16 16.3 19 12 20.5 C7.7 19 4.5 16 4.5 12 V6.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M8.8 12 L11 14.2 L15.2 9.8" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Audits: clipboard ───── */
export const AuditsIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="16" rx="3" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <rect x="9" y="3.5" width="6" height="3.5" rx="1.6" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Non-Conformities: soft triangle with ! ───── */
export const NonConformitiesIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M10.4 4.2 A1.8 1.8 0 0 1 13.6 4.2 L20.7 17.8 A1.8 1.8 0 0 1 19.1 20.5 H4.9 A1.8 1.8 0 0 1 3.3 17.8 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <line x1="12" y1="10" x2="12" y2="14" stroke="currentColor" strokeWidth={S} />
    <line x1="12" y1="16.8" x2="12" y2="16.8" stroke="currentColor" strokeWidth="1.9" />
  </Svg>
);

/* ───── Reports: document ───── */
export const ReportsIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5 H14 L19 8.5 V19 A2 2 0 0 1 17 21 H6.5 A2 2 0 0 1 4.5 19 V5.5 A2 2 0 0 1 6.5 3.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M14 3.5 V8.5 H19" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Company Management: 3 calm buildings ───── */
export const CompanyManagementIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <rect x="3" y="10" width="6" height="11" rx="2" stroke="currentColor" strokeWidth={S} />
    <rect x="9" y="6" width="6" height="15" rx="2" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <rect x="15" y="12" width="6" height="9" rx="2" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── User Management: 2 people ───── */
export const UserManagementIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="3" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M3.8 19.5 C4.8 16 6.7 14.5 9 14.5 C11.3 14.5 13.2 16 14.2 19.5" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth={S} />
    <path d="M14.6 14.6 C15.4 13.6 16.1 13.2 17 13.2 C18.7 13.2 20.4 14.6 21 17.2" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Sub-tabs ───── */

/* My Training: single avatar with cap */
export const MyTrainingIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M5 8.5 L12 5.5 L19 8.5 L12 11.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <circle cx="12" cy="14" r="2.5" stroke="currentColor" strokeWidth={S} />
    <path d="M7 20 C7.7 17.5 9.6 16 12 16 C14.4 16 16.3 17.5 17 20" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Organization Training: 3 avatars */
export const OrganizationTrainingIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <circle cx="6" cy="10" r="2" stroke="currentColor" strokeWidth={S} />
    <circle cx="18" cy="10" r="2" stroke="currentColor" strokeWidth={S} />
    <circle cx="12" cy="8" r="2.5" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M7.5 17 C8.3 14.5 10 13 12 13 C14 13 15.7 14.5 16.5 17" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Training Rules: shield with one line */
export const TrainingRulesIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M12 3.5 L19 6 V12 C19 16 16 19 12 20.5 C8 19 5 16 5 12 V6 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <line x1="9.5" y1="12" x2="14.5" y2="12" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Profile / drawer extras ───── */

/* Profile: head + shoulders */
export const ProfileIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="3.5" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M5 20.5 C6 17 9 15.5 12 15.5 C15 15.5 18 17 19 20.5" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Subscription: card */
export const SubscriptionIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3.5" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Settings: gear (clean ring, no teeth clutter) */
export const SettingsIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Bell: notification */
export const BellIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M12 3.5 C8.9 3.5 6.5 6 6.5 9 V13 L5 16 H19 L17.5 13 V9 C17.5 6 15.1 3.5 12 3.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M10 18 C10.4 19.2 11.1 20 12 20 C12.9 20 13.6 19.2 14 18" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Logout: door + arrow */
export const LogoutIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M4.5 4.5 H11 V19.5 H4.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth={S} />
    <path d="M17 9 L20 12 L17 15" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Home: house */
export const HomeIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M3.5 11 L12 4 L20.5 11 V19.5 H3.5 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* ───── Topbar ───── */

/* AI Assistant: friendly robot face: antenna, head with rounded corners,
   two eyes and a chat-style mouth slot. Reads clearly as a chatbot. */
export const AiAssistantIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    {/* Antenna */}
    <line x1="12" y1="2.5" x2="12" y2="5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    <circle cx="12" cy="2.2" r="1" fill="currentColor" />
    {/* Head */}
    <rect
      x="3.5"
      y="5.5"
      width="17"
      height="13"
      rx="3.5"
      fill="currentColor"
      fillOpacity={TINT}
      stroke="currentColor"
      strokeWidth={S}
    />
    {/* Eyes */}
    <circle cx="9" cy="11.5" r="1.3" fill="currentColor" />
    <circle cx="15" cy="11.5" r="1.3" fill="currentColor" />
    {/* Mouth: chat slot */}
    <rect x="8.5" y="14.5" width="7" height="1.6" rx="0.8" fill="currentColor" />
    {/* Side ears */}
    <line x1="2.5" y1="10.5" x2="2.5" y2="13.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    <line x1="21.5" y1="10.5" x2="21.5" y2="13.5" stroke="currentColor" strokeWidth={S} strokeLinecap="round" />
    {/* Chat speech tail under the head, to hint at "chatbot" */}
    <path d="M9.5 18.5 L11 21 L13 18.5 Z" fill="currentColor" />
  </Svg>
);

/* Admin shield: simple shield */
export const AdminShieldIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <path d="M12 3.5 L19 6 V12 C19 16 16 19 12 20.5 C8 19 5 16 5 12 V6 Z" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M9 12 L11.2 14.2 L15 10" stroke="currentColor" strokeWidth={S} />
  </Svg>
);

/* Menu: hamburger */
export const MenuIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <line x1="4.5" y1="7" x2="19.5" y2="7" stroke="currentColor" strokeWidth="1.7" />
    <line x1="4.5" y1="12" x2="19.5" y2="12" stroke="currentColor" strokeWidth="1.7" />
    <line x1="4.5" y1="17" x2="19.5" y2="17" stroke="currentColor" strokeWidth="1.7" />
  </Svg>
);

/* ───── Activity log: soft clock ───── */
export const ActivityLogIllustration = (p: SidebarIllustrationProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={S} />
    <path d="M12 8 V12 L15 13.5" stroke="currentColor" strokeWidth={S} />
  </Svg>
);
