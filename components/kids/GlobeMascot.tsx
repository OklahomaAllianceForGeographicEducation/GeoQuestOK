// components/kids/GlobeMascot.tsx
//
// "Globey" -- the placeholder cartoon-globe mascot for the (kids-tabs)
// shell, drawn as inline SVG rather than a raster asset. GeoQuestOK has a
// real globe mascot planned (the team's own photos/art, not yet available),
// so this is deliberately simple and swappable: a friendly sphere with
// continent shapes, a face, and a couple of pose variants, built entirely
// from react-native-svg primitives -- no external image file, no AI-
// generated art standing in as "the real thing." Replace this file's
// contents with real artwork once it exists; every call site just renders
// <GlobeMascot pose="..." size={...} />, so the swap is contained here.
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { kidsColors } from '../../styles/kidsTheme';

export type GlobeMascotPose = 'wave' | 'cheer' | 'think' | 'point' | 'idle';

type GlobeMascotProps = {
    pose?: GlobeMascotPose;
    size?: number;
};

// One 120x130 viewBox shared by every pose, so poses can be swapped without
// the character jumping around. Body/face stay fixed; only the arms (and,
// for 'think', one eyebrow) move between poses.
export default function GlobeMascot({ pose = 'idle', size = 96 }: GlobeMascotProps) {
    const armColor = kidsColors.berry;
    const armShadow = kidsColors.berryDeep;

    return (
        <Svg width={size} height={size * (130 / 120)} viewBox="0 0 120 130" fill="none">
            {/* Ground shadow */}
            <Ellipse cx="60" cy="122" rx="26" ry="6" fill={kidsColors.skyDeep} opacity={0.15} />

            {/* Feet */}
            <Ellipse cx="47" cy="112" rx="10" ry="7" fill={kidsColors.grassDeep} />
            <Ellipse cx="73" cy="112" rx="10" ry="7" fill={kidsColors.grassDeep} />

            {/* Arms (behind body) -- pose-specific */}
            {pose === 'cheer' ? (
                <>
                    <Path d="M28 72 Q10 50 16 30" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Path d="M92 72 Q110 50 104 30" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="15" cy="27" r="9" fill={armColor} />
                    <Circle cx="105" cy="27" r="9" fill={armColor} />
                </>
            ) : pose === 'wave' ? (
                <>
                    <Path d="M30 74 Q16 74 12 90" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="10" cy="93" r="9" fill={armColor} />
                    <Path d="M90 74 Q112 60 108 24" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="107" cy="20" r="9" fill={armColor} />
                </>
            ) : pose === 'think' ? (
                <>
                    <Path d="M30 74 Q16 74 12 90" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="10" cy="93" r="9" fill={armColor} />
                    <Path d="M90 74 Q100 56 82 40" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="80" cy="38" r="9" fill={armColor} />
                </>
            ) : pose === 'point' ? (
                <>
                    <Path d="M30 74 Q16 74 12 90" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="10" cy="93" r="9" fill={armColor} />
                    <Path d="M90 72 Q118 66 122 50" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="122" cy="47" r="9" fill={armColor} />
                </>
            ) : (
                <>
                    <Path d="M30 74 Q16 74 12 90" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="10" cy="93" r="9" fill={armColor} />
                    <Path d="M90 74 Q104 74 108 90" stroke={armShadow} strokeWidth={13} strokeLinecap="round" />
                    <Circle cx="110" cy="93" r="9" fill={armColor} />
                </>
            )}

            {/* Globe body */}
            <Circle cx="60" cy="60" r="46" fill={kidsColors.skyBright} stroke={kidsColors.white} strokeWidth={5} />

            {/* Continents -- soft rounded blobs, deliberately simplified */}
            <Path
                d="M34 34 Q26 40 30 50 Q22 54 26 64 Q32 70 42 66 Q46 74 56 70 Q52 60 58 54 Q50 48 50 40 Q44 32 34 34 Z"
                fill={kidsColors.grassBright}
                stroke={kidsColors.grass}
                strokeWidth={2}
            />
            <Path
                d="M74 30 Q66 34 68 42 Q60 46 64 54 Q72 58 78 52 Q86 54 88 44 Q92 36 84 32 Q80 26 74 30 Z"
                fill={kidsColors.grassBright}
                stroke={kidsColors.grass}
                strokeWidth={2}
            />
            <Path
                d="M64 74 Q56 78 60 86 Q68 90 76 84 Q82 88 86 80 Q80 72 72 74 Q68 70 64 74 Z"
                fill={kidsColors.grassBright}
                stroke={kidsColors.grass}
                strokeWidth={2}
            />

            {/* Latitude/longitude hint lines -- read as "globe," not "ball" */}
            <Path d="M18 60 Q60 48 102 60" stroke={kidsColors.white} strokeWidth={2} opacity={0.55} />
            <Path d="M60 16 Q78 60 60 104" stroke={kidsColors.white} strokeWidth={2} opacity={0.55} />

            {/* Cheeks */}
            <Ellipse cx="38" cy="66" rx="6" ry="4" fill={kidsColors.berryBright} opacity={0.55} />
            <Ellipse cx="82" cy="66" rx="6" ry="4" fill={kidsColors.berryBright} opacity={0.55} />

            {/* Face */}
            <Circle cx="46" cy="56" r="7" fill={kidsColors.white} />
            <Circle cx="74" cy="56" r="7" fill={kidsColors.white} />
            <Circle cx={pose === 'think' ? 48 : 47} cy="57" r="3.4" fill={kidsColors.ink} />
            <Circle cx={pose === 'think' ? 76 : 75} cy="57" r="3.4" fill={kidsColors.ink} />

            {pose === 'think' ? (
                <Path d="M40 46 Q46 42 52 46" stroke={kidsColors.ink} strokeWidth={3} strokeLinecap="round" />
            ) : null}

            {/* Smile */}
            <Path d="M46 70 Q60 82 74 70" stroke={kidsColors.ink} strokeWidth={4} strokeLinecap="round" />
        </Svg>
    );
}
