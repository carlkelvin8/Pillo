import { useId } from "react";
import { ASSISTANT_NAME } from "@/config/brand";
import { cn } from "@/lib/utils";

export type DrPillMood =
  | "happy"
  | "wink"
  | "think"
  | "sleepy"
  | "listening"
  | "talking"
  | "excited";

type DrPillAvatarProps = {
  mood?: DrPillMood;
  /** Rendered width in px. Height follows the 124:150 aspect ratio. */
  size?: number;
  /** Set true when the avatar sits next to text that already names it. */
  decorative?: boolean;
  className?: string;
};

const MOOD_LABEL: Record<DrPillMood, string> = {
  happy: "smiling",
  wink: "winking",
  think: "thinking",
  sleepy: "sleepy",
  listening: "listening",
  talking: "speaking",
  excited: "excited",
};

/**
 * Dr. Pill: genderless chibi capsule. Mint top, white bottom, glossy eyes,
 * blush, stethoscope, thick ink outline. All colors come from design tokens.
 */
export function DrPillAvatar({
  mood = "happy",
  size = 96,
  decorative = false,
  className,
}: DrPillAvatarProps) {
  const clipId = useId();
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": `${ASSISTANT_NAME}, ${MOOD_LABEL[mood]}` } as const);

  return (
    <svg
      viewBox="0 0 124 150"
      width={size}
      height={(size * 150) / 124}
      fill="none"
      className={cn(
        "pill-avatar",
        (mood === "listening" || mood === "talking" || mood === "excited") && "pill-avatar-glow",
        className,
      )}
      {...a11y}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="22" y="8" width="80" height="134" rx="40" />
        </clipPath>
      </defs>

      {/* Body: mint top, white bottom */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="22" y="8" width="80" height="78" fill="var(--color-mint)" />
        <rect x="22" y="86" width="80" height="56" fill="var(--color-surface)" />
        <path d="M22 86H102" stroke="var(--color-ink)" strokeWidth="3" />
        {/* Gloss */}
        <path
          d="M36 30C37 22 43 17 50 15"
          stroke="var(--color-surface)"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.7"
        />
      </g>

      {/* Stethoscope */}
      <path
        d="M40 86C40 104 52 110 62 110C72 110 84 104 84 86"
        stroke="var(--color-ink)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle
        cx="62"
        cy="114"
        r="7"
        fill="var(--color-mint-strong)"
        stroke="var(--color-ink)"
        strokeWidth="3.5"
      />

      {/* Blush */}
      <ellipse cx="38" cy="68" rx="6" ry="4" fill="var(--color-blush)" />
      <ellipse cx="86" cy="68" rx="6" ry="4" fill="var(--color-blush)" />

      <Face mood={mood} />

      {/* Outline */}
      <rect
        x="22"
        y="8"
        width="80"
        height="134"
        rx="40"
        stroke="var(--color-ink)"
        strokeWidth="5"
      />

      {mood === "think" ? (
        <g fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2.5">
          <circle cx="108" cy="30" r="3" />
          <circle cx="114" cy="19" r="4.5" />
        </g>
      ) : null}
      {mood === "sleepy" ? (
        <g fill="var(--color-ink)" fontFamily="var(--font-sans)" fontWeight="700">
          <text x="104" y="30" fontSize="14">
            z
          </text>
          <text x="111" y="18" fontSize="10">
            z
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function OpenEye({ cx, dx = 0, dy = 0 }: { cx: number; dx?: number; dy?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy="52" rx="8" ry="10" fill="var(--color-ink)" />
      <circle cx={cx + 3 + dx} cy={48 + dy} r="3" fill="var(--color-surface)" />
      <circle cx={cx - 3 + dx} cy={56 + dy} r="1.5" fill="var(--color-surface)" />
    </g>
  );
}

function Face({ mood }: { mood: DrPillMood }) {
  const stroke = { stroke: "var(--color-ink)", strokeWidth: 3.5, strokeLinecap: "round" } as const;
  const eyesClassName = "pill-avatar-eyes";

  if (mood === "sleepy") {
    return (
      <g>
        <path d="M38 53Q46 60 54 53" {...stroke} />
        <path d="M70 53Q78 60 86 53" {...stroke} />
        <path d="M57 69Q62 72 67 69" {...stroke} />
      </g>
    );
  }
  if (mood === "think") {
    return (
      <g>
        <g className={eyesClassName}>
          <OpenEye cx={46} dx={2} dy={-3} />
          <OpenEye cx={78} dx={2} dy={-3} />
        </g>
        <circle cx="62" cy="69" r="3" {...stroke} />
      </g>
    );
  }
  if (mood === "listening") {
    return (
      <g>
        <g className={eyesClassName}>
          <OpenEye cx={46} dy={-2} />
          <OpenEye cx={78} dy={-2} />
        </g>
        <ellipse cx="62" cy="69" rx="4" ry="5" fill="var(--color-ink)" />
      </g>
    );
  }
  if (mood === "talking") {
    return (
      <g>
        <g className={eyesClassName}>
          <path d="M38 53Q46 59 54 53" {...stroke} />
          <path d="M70 53Q78 59 86 53" {...stroke} />
        </g>
        <ellipse className="pill-avatar-mouth" cx="62" cy="69" rx="5" ry="6" fill="var(--color-ink)" />
        <ellipse cx="62" cy="72" rx="2.5" ry="1.5" fill="var(--color-blush)" />
      </g>
    );
  }
  if (mood === "excited") {
    return (
      <g>
        <g className={eyesClassName}>
          <path d="M46 42L48 48L54 50L48 52L46 58L44 52L38 50L44 48Z" fill="var(--color-ink)" />
          <path d="M78 42L80 48L86 50L80 52L78 58L76 52L70 50L76 48Z" fill="var(--color-ink)" />
        </g>
        <path d="M51 64Q62 80 73 64Q72 78 62 78Q52 78 51 64Z" fill="var(--color-ink)" />
      </g>
    );
  }
  if (mood === "wink") {
    return (
      <g>
        <g className={eyesClassName}>
          <OpenEye cx={46} />
          <path d="M70 54Q78 46 86 54" {...stroke} />
        </g>
        <path d="M54 65Q62 76 70 65" {...stroke} />
      </g>
    );
  }
  return (
    <g>
      <g className={eyesClassName}>
        <OpenEye cx={46} />
        <OpenEye cx={78} />
      </g>
      <path d="M54 65Q62 76 70 65" {...stroke} />
    </g>
  );
}
