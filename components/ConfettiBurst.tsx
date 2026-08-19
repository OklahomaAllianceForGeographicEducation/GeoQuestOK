// components/ConfettiBurst.tsx
// A short celebratory confetti burst, shown over the "Badge Unlocked!"
// popup in BadgeUnlockProvider.tsx. Mounting this component plays the
// burst once; remount it (e.g. via a `key` tied to the badge id) to play
// it again. Particle shapes/images/colors are configured in
// lib/confetti.ts, not here.
//
// Uses React Native's built-in Animated API rather than
// react-native-reanimated -- this project has react-native-reanimated as a
// dependency but no babel.config.js registering its required plugin, so
// using it here would risk a runtime crash. Animated needs no extra setup.
//
// Motion model: three sources feed the same burst -- a "cannon" off each
// bottom corner, launching particles up and inward at a gentle angle/speed,
// plus a steady rain of particles dropping in from the top edge with
// little to no initial velocity. Every particle, regardless of source,
// falls under the SAME shared gravity constant (GRAVITY below) -- only the
// launch parameters (origin, initial velocity) are randomized per
// particle, not the physics itself. Animated's interpolate() only does
// piecewise-linear mapping, so each particle's parabolic arc is
// precomputed as a table of (x, y) samples over its lifetime and fed in as
// a multi-point interpolation range -- that's what buildTrajectory does.

import { Image } from 'expo-image';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { CONFETTI_COLORS, CONFETTI_SPECIALS, SPECIAL_PARTICLE_CHANCE, type ConfettiSpecial } from '../lib/confetti';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Each particle is its own Animated.View animating 3 interpolated
// transform properties at once -- 220 of those compositing simultaneously
// is heavy for mid/low-range Android GPUs (reported as the burst lagging
// on Android) even though the animation itself runs on the native driver.
// iOS's compositor handles the same load fine, so only Android gets a
// lighter particle count rather than reducing the effect everywhere.
const PARTICLE_COUNT = Platform.OS === 'android' ? 120 : 220;

// Shared physics constants -- every particle falls under this same
// gravity, in screen-heights per second squared, so the burst reads as one
// consistent physical event rather than each piece moving independently.
// Kept gentle on purpose (a slow, floaty fall reads as more "confetti",
// less "fired from a slingshot").
const GRAVITY = SCREEN_HEIGHT * 1.1;
const TRAJECTORY_SAMPLES = 20;

type Particle = {
    id: number;
    originX: number;
    originY: number;
    vx0: number;
    vy0: number;
    delay: number;
    duration: number;
    spinDegrees: number;
    spinDirection: 1 | -1;
    size: number;
    color: string;
    shape: 'square' | 'circle';
    special?: ConfettiSpecial;
};

function buildParticles(): Particle[] {
    return Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
        const isSpecial = CONFETTI_SPECIALS.length > 0 && Math.random() < SPECIAL_PARTICLE_CHANCE;
        // Split roughly evenly between the two side cannons and a top
        // drop, so all three sources read as part of one burst.
        const roll = Math.random();
        const source: 'left' | 'right' | 'top' = roll < 1 / 3 ? 'left' : roll < 2 / 3 ? 'right' : 'top';

        let originX: number;
        let originY: number;
        let vx0: number;
        let vy0: number;
        let delay: number;

        if (source === 'top') {
            // Straightforward rain from the top edge: a little sideways
            // drift, no initial vertical launch, just gravity. Spread the
            // delays out further than the cannons so the rain trickles in
            // over the whole burst instead of arriving all at once.
            originX = Math.random() * SCREEN_WIDTH;
            originY = -20;
            vx0 = (Math.random() - 0.5) * SCREEN_WIDTH * 0.15;
            vy0 = 0;
            delay = Math.random() * 900;
        } else {
            const fromLeft = source === 'left';
            // Cannons sit just off the bottom corners and fire up + inward
            // at a gentle angle/speed -- angleDeg is measured from
            // horizontal, so a bigger angle is a steeper, more vertical
            // launch.
            const angleDeg = 50 + Math.random() * 30; // 50-80 degrees
            const angleRad = (angleDeg * Math.PI) / 180;
            const speed = SCREEN_HEIGHT * (0.55 + Math.random() * 0.35); // px/sec, kept gentle
            const inwardSign = fromLeft ? 1 : -1;

            originX = fromLeft ? -10 : SCREEN_WIDTH + 10;
            originY = SCREEN_HEIGHT * (0.75 + Math.random() * 0.2);
            vx0 = speed * Math.cos(angleRad) * inwardSign;
            // Negative = upward (screen Y grows downward).
            vy0 = -speed * Math.sin(angleRad);
            delay = Math.random() * 260;
        }

        return {
            id: i,
            originX,
            originY,
            vx0,
            vy0,
            delay,
            duration: 4200 + Math.random() * 2200,
            spinDegrees: 360 + Math.random() * 720,
            spinDirection: Math.random() < 0.5 ? 1 : -1,
            size: isSpecial ? 22 + Math.random() * 8 : 8 + Math.random() * 6,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            shape: Math.random() < 0.5 ? 'square' : 'circle',
            special: isSpecial ? CONFETTI_SPECIALS[Math.floor(Math.random() * CONFETTI_SPECIALS.length)] : undefined,
        };
    });
}

// Samples the particle's parabolic trajectory (constant velocity outward,
// constant GRAVITY pulling down) at evenly-spaced points across its
// lifetime, returning progress/x/y arrays ready for Animated.interpolate.
function buildTrajectory(particle: Particle) {
    const progressPoints: number[] = [];
    const xPoints: number[] = [];
    const yPoints: number[] = [];
    const durationSeconds = particle.duration / 1000;

    for (let i = 0; i <= TRAJECTORY_SAMPLES; i++) {
        const progress = i / TRAJECTORY_SAMPLES;
        const t = progress * durationSeconds;
        progressPoints.push(progress);
        xPoints.push(particle.originX + particle.vx0 * t);
        yPoints.push(particle.originY + particle.vy0 * t + 0.5 * GRAVITY * t * t);
    }

    return { progressPoints, xPoints, yPoints };
}

function ConfettiParticle({ particle }: { particle: Particle }) {
    const progress = useRef(new Animated.Value(0)).current;
    const trajectory = useMemo(() => buildTrajectory(particle), [particle]);

    useEffect(() => {
        Animated.timing(progress, {
            toValue: 1,
            duration: particle.duration,
            delay: particle.delay,
            easing: Easing.linear,
            useNativeDriver: true,
        }).start();
        // Runs once per mount -- a fresh Particle object (and therefore a
        // fresh mount, via the parent's `key`) is what replays the burst.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const translateX = progress.interpolate({
        inputRange: trajectory.progressPoints,
        outputRange: trajectory.xPoints,
    });
    const translateY = progress.interpolate({
        inputRange: trajectory.progressPoints,
        outputRange: trajectory.yPoints,
    });
    const rotate = progress.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', `${particle.spinDegrees * particle.spinDirection}deg`],
    });
    // Start fading out in the last 20% so particles don't just vanish
    // abruptly once they fall off the bottom of the screen.
    const opacity = progress.interpolate({
        inputRange: [0, 0.8, 1],
        outputRange: [1, 1, 0],
    });

    return (
        <Animated.View style={[styles.particle, { opacity, transform: [{ translateX }, { translateY }, { rotate }] }]}>
            {particle.special ? (
                typeof particle.special === 'string' ? (
                    <Text style={{ fontSize: particle.size }}>{particle.special}</Text>
                ) : (
                    <Image
                        source={{ uri: particle.special.uri }}
                        style={{ width: particle.size, height: particle.size }}
                        contentFit="contain"
                    />
                )
            ) : (
                <View
                    style={{
                        width: particle.size,
                        height: particle.size,
                        backgroundColor: particle.color,
                        borderRadius: particle.shape === 'circle' ? particle.size / 2 : 2,
                    }}
                />
            )}
        </Animated.View>
    );
}

export default function ConfettiBurst() {
    // Built once per mount -- the parent remounts this component (via a
    // changing `key`) to play a fresh burst rather than this component
    // re-triggering itself.
    const particles = useMemo(() => buildParticles(), []);

    return (
        <View style={styles.overlay}>
            {particles.map((p) => (
                <ConfettiParticle key={p.id} particle={p} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        pointerEvents: 'none',
    },
    particle: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
});
