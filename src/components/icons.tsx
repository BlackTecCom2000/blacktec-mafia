import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: Props) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

export function MoonIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M20 14.6A8.4 8.4 0 0 1 9.4 4a8.5 8.5 0 1 0 10.6 10.6Z" />
      <path d="M17 4.5v2.2M15.9 5.6h2.2" />
    </svg>
  );
}

export function SunIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

export function ChatIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H8L4 22v-4.8A7.5 7.5 0 0 1 12.5 4.5 7.5 7.5 0 0 1 20 12Z" />
      <path d="M8.5 11h7M8.5 14.2h4.5" />
    </svg>
  );
}

export function BallotIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M5 11.5h14V21H5z" />
      <path d="M9 11.5V8a3 3 0 0 1 6 0v3.5" />
      <path d="M9 16.4l1.8 1.8L15.5 14" />
    </svg>
  );
}

export function StarIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="m12 3.2 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8Z" />
    </svg>
  );
}

export function MicIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="2.8" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.2M8.6 21.2h6.8" />
    </svg>
  );
}

export function MicOffIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M9 5.2A3 3 0 0 1 15 5.8v5.4M15 15.2a3 3 0 0 1-6-1.6v-1.2" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 9.6 5.7M18.5 11.5v.6M12 18v3.2M8.6 21.2h6.8" />
      <path d="M3.6 3.6 20.4 20.4" />
    </svg>
  );
}

export function SpeakerOffIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M4 9.5h3.2L12 5.2v13.6L7.2 14.5H4Z" />
      <path d="m16 9.4 4 5.2M20 9.4l-4 5.2" />
    </svg>
  );
}

export function BanIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="m6.2 6.2 11.6 11.6" />
    </svg>
  );
}

export function SearchIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 4.6 4.6" />
    </svg>
  );
}

export function RefreshIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4.5V10h-5.4" />
    </svg>
  );
}

export function DaggerIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 3 21 9.5l-8.4 8.4-6.5-6.5L14.5 3Z" />
      <path d="M6.1 11.4 3 21l9.6-3.1" />
      <path d="M13 8.5l2.5 2.5" />
    </svg>
  );
}

export function MaskIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 5.5C6.8 4.3 9.5 4 12 4s5.2.3 8.5 1.5c0 6.2-2 12-6.2 14.2a8 8 0 0 1-4.6 0C5.5 17.5 3.5 11.7 3.5 5.5Z" />
      <path d="M7.5 10.5c1-.8 2.2-.8 3.2 0M13.3 10.5c1-.8 2.2-.8 3.2 0M9 15.2c1.9 1.2 4.1 1.2 6 0" />
    </svg>
  );
}

export function CrossIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
    </svg>
  );
}

export function LensIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5M8 10.5h5M10.5 8v5" />
    </svg>
  );
}

export function CitizenIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 21c0-3.9 3.1-6.4 7-6.4s7 2.5 7 6.4" />
    </svg>
  );
}

export function UsersIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M2.8 20c0-3.5 2.8-5.8 6.2-5.8s6.2 2.3 6.2 5.8" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6.2M17.5 14.7c2.2.6 3.7 2.4 3.7 4.6" />
    </svg>
  );
}

export function CopyIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" />
    </svg>
  );
}

export function ArrowRightIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h15M13.5 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowLeftIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M20 12H5M10.5 6l-6 6 6 6" />
    </svg>
  );
}

export function SendIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M4 12 20.5 4.5 15 21l-3.6-7.4L4 12Z" />
      <path d="M11.4 13.6 20.5 4.5" />
    </svg>
  );
}

export function SkullIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M5 11a7 7 0 1 1 14 0c0 2.6-1.3 4.1-2.6 5.1V20H7.6v-3.9C6.3 15.1 5 13.6 5 11Z" />
      <circle cx="9.2" cy="11" r="1.3" />
      <circle cx="14.8" cy="11" r="1.3" />
      <path d="M10.6 15.2 12 16.6l1.4-1.4M10.4 20v-2.2M13.6 20v-2.2" />
    </svg>
  );
}

export function CheckIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export function ExitIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9" />
    </svg>
  );
}

export function LinkIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M10.5 13.5 13.5 10.5" />
      <path d="M8.2 16.8 6 19a3.5 3.5 0 0 1-5-5l2.2-2.2" />
      <path d="M15.8 7.2 18 5a3.5 3.5 0 0 1 5 5l-2.2 2.2" />
      <path d="M7 11.5 5.5 13M16.5 10.5 18 9" />
    </svg>
  );
}

export function SealIcon(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="10" r="6.2" />
      <path d="M8.5 15.2 7.2 22l4.8-2.4L16.8 22l-1.3-6.8" />
      <path d="M9.6 10h4.8M12 7.6v4.8" />
    </svg>
  );
}

export function roleIcon(role: string, props: Props) {
  switch (role) {
    case 'mafia':
      return <MaskIcon {...props} />;
    case 'doctor':
      return <CrossIcon {...props} />;
    case 'detective':
      return <LensIcon {...props} />;
    case 'sheriff':
      return <StarIcon {...props} />;
    case 'maniac':
      return <DaggerIcon {...props} />;
    default:
      return <CitizenIcon {...props} />;
  }
}

export function phaseIcon(phase: string, props: Props) {
  switch (phase) {
    case 'night':
      return <MoonIcon {...props} />;
    case 'dawn':
      return <SunIcon {...props} />;
    case 'discussion':
      return <ChatIcon {...props} />;
    case 'voting':
      return <BallotIcon {...props} />;
    case 'execution':
      return <DaggerIcon {...props} />;
    case 'gameover':
      return <SkullIcon {...props} />;
    default:
      return <UsersIcon {...props} />;
  }
}
