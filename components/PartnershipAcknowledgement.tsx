// components/PartnershipAcknowledgement.tsx
// Shared partnership/legal disclosure text shown on every auth screen
// (login, signup, reset-password) so a wary parent, teacher, or student can
// verify this app is legitimate. Previously the same paragraph (and a
// near-identical style object) was copy-pasted verbatim across all three
// screens -- consolidated here so the copy only needs editing in one place.
// Each screen still owns its own style object (spacing/padding differs
// slightly between them -- see login.tsx/signup.tsx/reset-password.tsx's
// own acknowledgementText styles), passed in via the `style` prop rather
// than hardcoded here, so this component doesn't force one screen's
// spacing onto the others.

import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

// Props for PartnershipAcknowledgement:
// - style: optional TextStyle passed straight through to the underlying
//   <Text>. Each screen that uses this component supplies its own spacing
//   here (rather than this component hardcoding one layout) because the
//   surrounding screens (login/signup/reset-password) each need slightly
//   different padding/margins around the disclosure text.
type Props = {
    style?: StyleProp<TextStyle>;
};

// Required CMS grant acknowledgement for the Oklahoma Rural Health
// Transformation Program funding. Exported so the marketing site footer
// (components/web/WebFooter.tsx) shows the exact same wording -- this is
// grant-mandated copy, so keep it verbatim and edit it only here.
export const FUNDING_STATEMENT =
    'This grant is supported by the Centers for Medicare & Medicaid Services (CMS) of the U.S. Department of Health and Human Services (HHS) as part of a financial assistance award, RHTCMS332048, totaling $223,476,948.62 with 100 percent funded by CMS/HHS. The contents are those of the author(s) and do not necessarily represent the official views of, nor an endorsement, by CMS/HHS, or the U.S. Government.';

// PartnershipAcknowledgement
// A tiny presentational component (no state, no logic) that just renders a
// fixed block of legal/partnership disclosure copy inside a <Text>. It
// exists purely to avoid copy-pasting the same paragraph (and near-duplicate
// style objects) into every auth screen. Not a modal and not a Context
// provider -- just a shared snippet of static text with caller-supplied
// styling.
// Returns: a single <Text> element containing the partnership paragraph
// followed by the CMS funding statement (nested so the caller's style
// applies to both).
export default function PartnershipAcknowledgement({ style }: Props) {
    return (
        <Text style={style}>
            The GeoQuestOK app is a partnership between the Oklahoma State Department of Education’s
            Health & Physical Education Department and the Oklahoma Alliance for Geographic Education.
            This program works to fulfill the “Walk Across Oklahoma” foundation created by Oklahoma House
            Bill 1647.
            {'\n\n'}
            {FUNDING_STATEMENT}
        </Text>
    );
}
