// app/privacy-policy.tsx
//
// WHAT THIS SCREEN IS: the static Privacy Policy page for GeoQuestOK.
//
// HOW IT'S REACHED: Expo Router maps a file at app/privacy-policy.tsx
// directly to the route "/privacy-policy" — the file's name (minus the
// .tsx extension) becomes the URL path, with no extra routing config
// needed. It's presumably linked to from WebFooter (shown on every
// marketing page) and possibly from the signup/account screens.
//
// WHAT THIS FILE DOES: there's no state, no effects, and no Supabase
// calls here at all — this is pure static content. All of the actual
// layout/visual work (page title, effective-date badge, section spacing,
// etc.) lives in components/web/LegalPageLayout.tsx, which this file
// imports a small set of purpose-built "building block" components from
// (LegalIntro, LegalHeading, LegalSubheading, LegalParagraph,
// LegalBulletList, LegalInfoCard, LegalRoleTable). This file's only job is
// to arrange those building blocks in order and supply the actual policy
// text as children/props — think of it like filling in a template with
// content, rather than building a screen from scratch.
import React from 'react';
import { Text } from 'react-native';
import LegalPageLayout, {
    // LegalIntro: an opening/lede paragraph, styled distinctly from the
    // numbered-section paragraphs (LegalParagraph) further down.
    LegalBulletList,
    // LegalHeading / LegalSubheading: numbered section titles ("1. Who
    // Uses GeoQuestOK") and the smaller sub-titles nested under them
    // ("Account information").
    LegalHeading,
    // LegalInfoCard: a visually distinct boxed callout, used just once
    // below to hold the operator/contact/mailing-address block.
    LegalInfoCard,
    LegalIntro,
    // LegalParagraph: a normal body paragraph of policy text.
    LegalParagraph,
    // LegalRoleTable: a table specifically shaped for "role -> what they
    // can see" rows, used in Section 4 below.
    LegalRoleTable,
    LegalSubheading,
} from '../components/web/LegalPageLayout';

// The default-exported screen component Expo Router renders for
// "/privacy-policy". Takes no props and returns the whole policy page.
// LegalPageLayout itself is presumably what renders the shared WebNav/
// WebFooter chrome around this content, plus the "title" and
// "effectiveDate" shown at the top of the page.
export default function PrivacyPolicyPage() {
    return (
        <LegalPageLayout title="GeoQuestOK Privacy Policy" effectiveDate="August 24, 2026">
            <LegalIntro>
                GeoQuestOK is an Oklahoma geography and fitness walking program for K-12 classrooms and youth groups.
                It was created by the Oklahoma Alliance for Geographic Education (OKAGE) as part of the Walk Across
                Oklahoma program and is supported by the Oklahoma State Department of Education (OSDE). GeoQuestOK
                is provided free of charge to all Oklahomans.
            </LegalIntro>
            <LegalIntro>
                This privacy policy explains what information GeoQuestOK (&ldquo;the app&rdquo;, &ldquo;we&rdquo;,
                &ldquo;us&rdquo;) collects, how it is used, who can see it, and the choices available to users,
                families, and districts.
            </LegalIntro>

            <LegalInfoCard>
                <Text style={{ fontWeight: '700' }}>Operator: Oklahoma Alliance for Geographic Education (OKAGE)</Text>
                <Text style={{ fontWeight: '700' }}>Contact: okage@ou.edu</Text>
                <Text style={{ fontWeight: '700' }}>Mailing Address: 100 E Boyd St. Rm 684. Norman, Oklahoma 73019.</Text>
            </LegalInfoCard>

            <LegalHeading>1. Who Uses GeoQuestOK</LegalHeading>
            <LegalParagraph>The App supports several account types:</LegalParagraph>
            <LegalBulletList
                items={[
                    'Students (K-12)',
                    'Teachers and youth/scout/club leaders',
                    'Site Administrators (school principals)',
                    'District Administrators',
                    'OKAGE program staff',
                ]}
            />
            <LegalParagraph>What information a person can see depends on their role — see Section 4.</LegalParagraph>

            <LegalHeading>2. Information We Collect</LegalHeading>

            <LegalSubheading>Account information</LegalSubheading>
            <LegalBulletList
                items={[
                    'Email address, username, and password (used only for sign-in; passwords are encrypted and never visible to us in plain text)',
                    'Display name',
                    'Account role (student, teacher, site admin, district admin, etc.)',
                    'School and district affiliation (for teachers, site admin, and district admin)',
                    'Grade levels taught (for teachers, site admin, and district admin)',
                    "A generated avatar image (a small illustrated icon produced from a text pattern tied to your username — GeoQuestOK does not support uploading a real photo, and no camera or photo-library access is ever requested)",
                ]}
            />

            <LegalSubheading>Activity you log</LegalSubheading>
            <LegalBulletList
                items={[
                    'Miles, minutes, or steps you record for an activity (walking, running, cycling, swimming, dancing)',
                    'Fitness self-assessments you choose to enter (e.g., push-ups, plank time, mile-run time), compared against standard age-and-sex benchmark tables to show whether a target was met',
                    'Quiz answers and scores',
                    'Badges and trail-completion milestones earned',
                    'A private journal reflection field, if you choose to write one (see Section 4 — this is never shown to teachers or administrators)',
                ]}
            />

            <LegalSubheading>Information we do not collect</LegalSubheading>
            <LegalBulletList
                items={[
                    "No GPS or real-time location data. GeoQuestOK does not access your device's location. The dot shown moving along a trail map is calculated from the mileage you manually enter — it is not derived from GPS or any sensor.",
                    'No photos or camera access.',
                    'No advertising identifiers, and we do not use the App to serve ads.',
                    'No third-party analytics or tracking SDKs are built into the App.',
                ]}
            />

            <LegalSubheading>Optional fields</LegalSubheading>
            <LegalParagraph>
                Students may optionally enter their current age and a fitness benchmark group (used only to select
                the correct age/sex row in a fitness-benchmark table) on the Fitness screen. These fields are not
                required to create an account and are not collected at sign-up. Student age is not stored or
                collected as their birthdate.
            </LegalParagraph>

            <LegalHeading>3. How We Use Information</LegalHeading>
            <LegalParagraph>We use the information above to:</LegalParagraph>
            <LegalBulletList
                items={[
                    'Create and secure user accounts',
                    'Track progress along trails and toward badges',
                    'Let teachers and school/district staff view progress reports appropriate to their role (Section 4)',
                    'Operate class rosters, quizzes, and curriculum content',
                    'Diagnose and fix bugs (via error-monitoring tooling, described in Section 5)',
                    'Meet reporting obligations to our program partner (OSDE). This is always done in aggregate at the school or district level. Individually identifiable student reports are not available to OKAGE or OSDE.',
                ]}
            />
            <LegalParagraph>
                We do not sell personal information, and we do not use student information for advertising or
                marketing purposes.
            </LegalParagraph>

            <LegalHeading>4. Who Can See Your Information</LegalHeading>
            <LegalParagraph>GeoQuestOK is built so that each role only sees the data it needs:</LegalParagraph>
            <LegalRoleTable
                rows={[
                    { role: 'You (any user)', sees: 'Your own full account and activity history, including your private journal reflections' },
                    { role: 'Other students in your classes', sees: 'Your display name (or username), generated avatar, total miles, and leaderboard rank' },
                    { role: 'Your teacher', sees: 'Full activity detail for students in their own classes (miles, activity logs, quiz results). Teachers do not see your private journal reflections.' },
                    { role: "Your school's Site Administrator", sees: 'Per-student mileage and fitness-target totals for students at their own school; aggregate-only (school-level) totals for other schools in the district' },
                    { role: 'District Administrator', sees: 'Class- and school-level aggregate totals only. District administrators do not see individual student names, accounts, or activity' },
                    { role: 'OKAGE program staff', sees: 'Statewide, school-level aggregate totals only.' },
                ]}
            />
            <LegalParagraph>
                Leaderboard visibility: because the leaderboard shows your display name and progress to every
                student you share a class with, we recommend students and families choose a display name that is
                not their full real name if they prefer more privacy. Teachers have the ability to set their
                classes to only use randomized usernames.
            </LegalParagraph>

            <LegalHeading>5. Service Providers</LegalHeading>
            <LegalParagraph>
                We use a small number of vendors to operate the App. None of them are permitted to use GeoQuestOK
                data for their own advertising or resale.
            </LegalParagraph>
            <LegalBulletList
                items={[
                    'Supabase: our database, authentication, and file-storage provider. All account and activity data described above is stored with Supabase.',
                    'Sentry: error-monitoring only, used to catch and fix bugs. Sentry is configured to not collect default personal information, session replay is disabled, and known personal-data patterns (like email addresses) are stripped from diagnostic data before it is sent.',
                    'Resend: used only to deliver account-related emails (email confirmation, password reset) to staff accounts.',
                ]}
            />
            <LegalParagraph>We do not share information with data brokers or advertising networks.</LegalParagraph>

            <LegalHeading>6. Data Security</LegalHeading>
            <LegalParagraph>
                We use industry-standard technical safeguards, including encrypted data transmission and
                database-level access controls (row-level security) that limit each account to only the data its
                role is permitted to see, as described in Section 4. No system is completely secure, and we cannot
                guarantee absolute security.
            </LegalParagraph>

            <LegalHeading>7. Data Retention and Deletion</LegalHeading>
            <LegalParagraph>
                Accounts and their associated activity data are retained for as long as the account is active.
                Accounts and their data can be deleted through the account page of the GeoQuestOK app.
            </LegalParagraph>

            <LegalHeading>8. Your Choices</LegalHeading>
            <LegalBulletList
                items={[
                    'You can review and update your account information from the Account screen at any time.',
                    "You can delete individual activity-log entries you've submitted.",
                    "Parents/guardians and school staff can contact us to request access to, correction of, or deletion of a student's information, subject to verification.",
                    "If you'd prefer not to use the digital app at all, ask your teacher about paper-based alternative assignments for the Walk Across Oklahoma program.",
                ]}
            />

            <LegalHeading>9. Changes to This Policy</LegalHeading>
            <LegalParagraph>
                We will update the Effective Date above when this policy changes, and will notify participating
                schools/districts of material changes.
            </LegalParagraph>

            <LegalHeading>10. Contact Us</LegalHeading>
            <LegalParagraph>
                Questions about this policy or your data can be directed to: okage@ou.edu — 100 E Boyd St. Rm 684.
                Norman, Oklahoma 73019.
            </LegalParagraph>
        </LegalPageLayout>
    );
}
