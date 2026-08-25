// app/terms.tsx
//
// WHAT THIS SCREEN IS: the static Terms and Conditions page for GeoQuestOK.
//
// HOW IT'S REACHED: Expo Router maps a file at app/terms.tsx directly to
// the route "/terms" — the file's name (minus the .tsx extension) becomes
// the URL path, with no extra routing config needed. It's presumably
// linked to from WebFooter (shown on every marketing page), and possibly
// referenced during signup ("by creating an account... you agree to these
// Terms").
//
// WHAT THIS FILE DOES: exactly the same pattern as its sibling
// app/privacy-policy.tsx — there's no state, no effects, and no Supabase
// calls here at all, just static legal text. All of the actual layout/
// visual work (page title, effective-date badge, section spacing, heading
// numbering, etc.) lives in components/web/LegalPageLayout.tsx, which this
// file imports a small set of purpose-built "building block" components
// from (LegalIntro, LegalHeading, LegalBulletList, LegalParagraph). This
// file's only job is to arrange those building blocks in order and supply
// the actual Terms text as children/props, like filling in a template with
// content rather than building a screen from scratch.
import React from 'react';
import LegalPageLayout, {
    // LegalBulletList: renders an `items` array as a bulleted list.
    LegalBulletList,
    // LegalHeading: a numbered section title (e.g. "1. What GeoQuestOK Is").
    LegalHeading,
    // LegalIntro: an opening/lede paragraph, styled distinctly from the
    // numbered-section paragraphs (LegalParagraph) further down.
    LegalIntro,
    // LegalParagraph: a normal body paragraph of legal text.
    LegalParagraph,
} from '../components/web/LegalPageLayout';

// The default-exported screen component Expo Router renders for "/terms".
// Takes no props and returns the whole Terms and Conditions page.
// LegalPageLayout itself is presumably what renders the shared WebNav/
// WebFooter chrome around this content, plus the "title" and
// "effectiveDate" shown at the top of the page (matching
// privacy-policy.tsx's structure exactly).
export default function TermsPage() {
    return (
        <LegalPageLayout title="GeoQuestOK Terms and Conditions" effectiveDate="August 24, 2026">
            <LegalIntro>
                These Terms and Conditions (&ldquo;Terms&rdquo;) govern access to and use of GeoQuestOK (the
                &ldquo;App&rdquo;), operated by the Oklahoma Alliance for Geographic Education, with support from
                the Oklahoma State Department of Education. By creating an account or using the App, you agree to
                these Terms.
            </LegalIntro>
            <LegalIntro>
                If you are under 18, a parent or guardian should review these Terms with you.
            </LegalIntro>

            <LegalHeading>1. What GeoQuestOK Is</LegalHeading>
            <LegalParagraph>
                GeoQuestOK lets students walk, bike, run, or otherwise self-report physical activity along real
                Oklahoma trails displayed in the App, complete geography and civics content tied to those trails,
                take quizzes, and earn badges. Trail maps show fixed, pre-drawn routes — the App does not track
                your device&rsquo;s real-world location; your position on a trail map is calculated from the
                mileage you manually log.
            </LegalParagraph>
            <LegalParagraph>
                GeoQuestOK is provided free of charge to Oklahoma schools, districts, and affiliated youth groups
                (e.g., scout troops, after-school programs).
            </LegalParagraph>

            <LegalHeading>2. Eligibility and Accounts</LegalHeading>
            <LegalBulletList
                items={[
                    'The App is intended for use by K-12 students, teachers, youth/club leaders, and school/district staff, primarily within Oklahoma.',
                    "Account types include Student, Teacher, Youth/Club Leader, Site Administrator, and District Administrator. Teacher, Site Administrator, and District Administrator accounts must be created with an email address on their school district's approved domain and must confirm that email before signing in.",
                    'You are responsible for keeping your password confidential and for all activity that occurs under your account.',
                    'Accounts are intended for one individual person each and may not be shared, sold, or transferred.',
                    "A note on children's accounts: where a student is under 13, use of the App is intended to occur under a school's or teacher's direction as part of a classroom or program activity, consistent with school consent obtained through the student's school or district, rather than as a stand-alone consumer product a child signs up for independently.",
                ]}
            />

            <LegalHeading>3. Acceptable Use</LegalHeading>
            <LegalParagraph>You agree not to:</LegalParagraph>
            <LegalBulletList
                items={[
                    'Impersonate another person, or create an account on behalf of someone else without authorization',
                    'Use profane, harassing, or inappropriate language in usernames, display names, or class names (the App runs automated filtering on these fields, and content may be blocked)',
                    'Attempt to falsify activity logs, quiz results, or fitness assessments in bad faith',
                    "Attempt to access another user's account, or data your role is not permitted to see",
                    "Probe, scan, or attempt to bypass the App's security or access controls",
                    'Use the App for any purpose other than the educational/fitness program it is designed for',
                ]}
            />
            <LegalParagraph>
                We may suspend or terminate accounts that violate these Terms, or at the request of a
                student&rsquo;s school or district.
            </LegalParagraph>

            <LegalHeading>4. User Content</LegalHeading>
            <LegalParagraph>
                Certain fields in the App — usernames, display names, class names, and private journal reflections
                — are entered by users. You retain ownership of what you write. By submitting this content, you
                grant us a limited license to store, process, and display it as necessary to operate the App (for
                example, showing your display name on a class roster or leaderboard). Private journal reflections
                are visible only to you and are not reviewed, shared, or used for any other purpose.
            </LegalParagraph>
            <LegalParagraph>
                We do not currently offer any public chat, comment, or messaging feature between users.
            </LegalParagraph>

            <LegalHeading>5. Program Content</LegalHeading>
            <LegalParagraph>
                Trail routes, curriculum materials, quiz content, standards alignments, and badge artwork are owned
                by the Oklahoma Alliance for Geographic Education, and are provided for use within the App for
                personal, educational, non-commercial purposes only. You may copy, redistribute, modify, or use
                this content outside the App for education purposes.
            </LegalParagraph>

            <LegalHeading>6. Fitness and Health Disclaimer</LegalHeading>
            <LegalParagraph>
                GeoQuestOK&rsquo;s fitness-tracking features (activity logging, Presidential Fitness Test-style
                self-assessments) rely entirely on information you self-report and are provided for educational and
                motivational purposes only. They are not medical advice, a medical device, or a substitute for
                guidance from a qualified physical education instructor or healthcare provider. Consult a doctor or
                PE teacher before beginning any new physical activity, especially if you have a health condition
                that could be affected by exercise.
            </LegalParagraph>

            <LegalHeading>7. No Warranty</LegalHeading>
            <LegalParagraph>
                The App is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; We do not guarantee the App
                will be uninterrupted, error-free, or fit for any particular purpose. Reported mileage, benchmarks,
                and other self-entered data reflect what users submit and are not independently verified for
                accuracy.
            </LegalParagraph>

            <LegalHeading>8. Limitation of Liability</LegalHeading>
            <LegalParagraph>
                To the fullest extent permitted by law, the Oklahoma Alliance for Geographic Education will not be
                liable for indirect, incidental, or consequential damages arising from use of the App. Because the
                App is provided free of charge, our total liability for any claim relating to the App is limited to
                the amount you paid to use the App, which is $0.
            </LegalParagraph>

            <LegalHeading>9. Termination</LegalHeading>
            <LegalParagraph>
                You may stop using the App and request account deletion at any time. We may suspend or terminate
                access to the App, in whole or in part, at our discretion, including to comply with a school or
                district&rsquo;s request regarding a student account.
            </LegalParagraph>

            <LegalHeading>10. Changes to These Terms</LegalHeading>
            <LegalParagraph>
                We may update these Terms from time to time. We will update the Effective Date above and, for
                material changes, notify participating schools/districts.
            </LegalParagraph>

            <LegalHeading>11. Contact</LegalHeading>
            <LegalParagraph>
                Questions about these Terms can be directed to: okage@ou.edu — 100 E Boyd St. Rm 684. Norman,
                Oklahoma 73019.
            </LegalParagraph>
        </LegalPageLayout>
    );
}
