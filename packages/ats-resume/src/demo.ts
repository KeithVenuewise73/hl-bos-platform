/**
 * Demo data — a transportation and operations executive.
 *
 * EVERY record built here carries `isSample: true`, and every screen that can
 * show it says "Sample data" on the record itself. That is not decoration:
 * this app's entire value proposition is that what it shows you is true, and
 * a demo profile that cannot be told apart from a real one would undermine
 * that on first contact.
 *
 * "Marcus Delgado" is fictional. The numbers are plausible for the role and
 * are here so the evidence matrix, the scoring and the claim validator can be
 * exercised end to end the moment the app starts.
 */

import { analyzeJob } from "./analysis.ts";
import { factsFromResume } from "./career-facts.ts";
import { generateTailoredResume } from "./optimizer.ts";
import { newId, now } from "./text.ts";
import { parseJobPosting } from "./job-parser.ts";
import { parseResume } from "./resume-parser.ts";
import type {
  Application,
  CandidateProfile,
  CareerFact,
  GeneratedResume,
  JobAnalysis,
  JobPosting,
  MasterResume,
} from "./types.ts";

export const DEMO_RESUME_TEXT = `Marcus Delgado
Transportation and Distribution Operations Leader
Phoenix, AZ | (602) 555-0148 | marcus.delgado@example.com | linkedin.com/in/marcusdelgado-sample

PROFESSIONAL SUMMARY
Operations leader with 14 years in final-mile and middle-mile delivery, warehousing and branch operations.
Built and ran multi-site delivery networks, managed independent contractors and drivers, and held budget responsibility of $18M.
Known for turning underperforming stations around through process discipline, driver retention and technology adoption.

CORE COMPETENCIES
Final-Mile Delivery, Middle-Mile Operations, Route Management, Independent Contractor Management, Warehouse Operations, Safety Programs, DOT Compliance, Process Improvement, Budget Management, Team Leadership, Customer Experience, Samsara, Excel, Power BI

PROFESSIONAL EXPERIENCE
Senior Operations Manager | Meridian Logistics Group | Phoenix, AZ | Mar 2019 - Present
• Led middle-mile operations supporting 85 daily routes, 11 independent contractors and approximately 85 drivers while maintaining 98.5% on-time off-dock performance.
• Managed drivers and daily delivery routes across three metro stations, reducing cost per stop by 12% over two peak seasons.
• Owned an operating budget of $18M covering linehaul, station labor and contractor settlements.
• Rebuilt the safety program after a 2020 audit, cutting preventable incidents per million miles by 41% in 18 months.
• Rolled out Samsara telematics and a driver scorecard to 11 contractor firms, lifting on-time departure from 91% to 98.5%.
• Hired, trained and coached 9 salaried supervisors; internal promotion rate reached 60% of open supervisor roles.

Station Manager | Copper State Delivery | Tucson, AZ | Jun 2015 - Feb 2019
• Ran a 42-route final-mile station with 140,000 sq ft of warehouse space and 60 associates across two shifts.
• Cut dock dwell time by 27% by resequencing inbound trailer unloads and staging by route density.
• Held DOT and OSHA compliance across a mixed fleet of 38 vehicles with zero recordable violations in four years.
• Improved customer complaint resolution from 72 hours to under 24 hours by restructuring the station's escalation path.

Operations Supervisor | Rio Grande Freight | El Paso, TX | Aug 2011 - May 2015
• Supervised 22 drivers and dispatch for a regional LTL lane network.
• Managed daily dispatch, load planning and driver hours-of-service compliance.
• Trained new dispatchers on routing software and customer escalation handling.

EDUCATION
B.S. Business Administration | Arizona State University | 2011

CERTIFICATIONS
Lean Six Sigma Green Belt, OSHA 30, Class A CDL (non-active)

ADDITIONAL INFORMATION
Volunteer logistics coordinator, Phoenix Community Food Bank (2018-present)
`;

export const DEMO_JOB_TEXT = `Director of Fleet and Transportation Operations
Sunrise Distribution Partners
Location: Phoenix, AZ
Employment type: Full-time
Compensation: $135,000 - $165,000 per year

About Sunrise Distribution Partners
Sunrise moves temperature-controlled freight for grocery and food service customers across the Southwest.

Responsibilities
• Own fleet management and transportation operations across four distribution centers.
• Lead a team of 6 managers and an extended workforce of approximately 220 drivers and warehouse associates.
• Own the transportation P&L, including a $40M annual operating budget.
• Drive continuous improvement across route optimization, dock productivity and cost per case delivered.
• Partner with carrier management and third party logistics providers to cover overflow volume.
• Build and maintain the safety program in line with DOT and FMCSA requirements.
• Report weekly on KPIs including on-time delivery, cost per mile and driver retention.

Minimum Qualifications
• Bachelor's degree in supply chain, business or a related field.
• 10+ years of progressive experience in transportation operations, with at least 5 years leading people leaders.
• Proven fleet management experience across a multi-site operation.
• Demonstrated P&L responsibility for a budget of $25M or greater.
• Working knowledge of DOT and FMCSA compliance requirements.
• Experience with transportation management systems (TMS) and telematics platforms.

Preferred Qualifications
• Experience in temperature-controlled or food distribution.
• Lean Six Sigma certification.
• Experience with Blue Yonder or Manhattan Associates.
• Master's degree or MBA is a plus.

Travel
• Travel up to 25% between distribution centers.

Physical Requirements
• Must be able to walk warehouse floors and occasionally lift up to 25 pounds.

Benefits
Medical, dental, vision, 401(k) with match, and paid time off.

Sunrise Distribution Partners is an equal opportunity employer.
`;

export interface DemoDataset {
  readonly profile: CandidateProfile;
  readonly resume: MasterResume;
  readonly facts: readonly CareerFact[];
  readonly job: JobPosting;
  readonly analysis: JobAnalysis;
  readonly generated: GeneratedResume;
  readonly applications: readonly Application[];
}

export function buildDemoDataset(userId: string): DemoDataset {
  const timestamp = now();
  const parsed = parseResume(DEMO_RESUME_TEXT);

  const profile: CandidateProfile = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    userId,
    fullName: parsed.fullName.length > 0 ? parsed.fullName : "Marcus Delgado",
    headline: parsed.headline,
    summary: parsed.summary.join(" "),
    contact: parsed.contact,
    isSample: true,
  };

  const resume: MasterResume = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: profile.id,
    label: "Master resume (sample)",
    format: "paste",
    rawText: DEMO_RESUME_TEXT,
    parsed,
    isDefault: true,
    isSample: true,
  };

  const facts = factsFromResume(profile.id, parsed, { isSample: true });

  const parsedJob = parseJobPosting({
    rawText: DEMO_JOB_TEXT,
    company: "Sunrise Distribution Partners",
    title: "Director of Fleet and Transportation Operations",
    location: "Phoenix, AZ",
  });

  const job: JobPosting = {
    id: newId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    profileId: profile.id,
    company: parsedJob.company,
    title: parsedJob.title,
    ...(parsedJob.location === undefined ? {} : { location: parsedJob.location }),
    rawText: DEMO_JOB_TEXT,
    facets: parsedJob.facets,
    requirements: parsedJob.requirements,
    keywords: parsedJob.keywords,
    isSample: true,
  };

  const analysis = analyzeJob({
    profileId: profile.id,
    resume,
    facts,
    job,
    isSample: true,
  });

  const generated = generateTailoredResume({
    profile,
    resume,
    facts,
    job,
    analysis,
  });

  const applications: readonly Application[] = [
    {
      id: newId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      profileId: profile.id,
      company: job.company,
      role: job.title,
      jobPostingId: job.id,
      analysisId: analysis.id,
      generatedResumeId: generated.id,
      dateAnalyzed: timestamp.slice(0, 10),
      status: "resume_created",
      interviewDates: [],
      notes: "Sample application created with the demo dataset.",
      isSample: true,
    },
  ];

  return { profile, resume, facts, job, analysis, generated, applications };
}

export const DEMO_NOTICE =
  "Sample data. Marcus Delgado is a fictional candidate and Sunrise Distribution Partners is a fictional employer, both created so the app can be tried immediately. Delete the sample profile in Settings once you have added your own.";
