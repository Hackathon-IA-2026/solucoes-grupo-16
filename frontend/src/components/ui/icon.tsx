import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "arrow-left"
  | "arrow-right"
  | "calendar"
  | "check"
  | "chevron-down"
  | "close"
  | "cloud"
  | "cpu"
  | "database"
  | "download"
  | "file"
  | "filter"
  | "info"
  | "network"
  | "refresh"
  | "search"
  | "trash"
  | "turbine"
  | "upload"
  | "wind";

const paths: Record<IconName, React.ReactNode> = {
  alert: <path d="M12 9v4m0 4h.01M10.3 3.8 2.4 18a2 2 0 0 0 1.75 3h15.7a2 2 0 0 0 1.75-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />,
  "arrow-left": <path d="m15 18-6-6 6-6" />,
  "arrow-right": <path d="m9 18 6-6-6-6" />,
  calendar: <><path d="M8 2v4m8-4v4M3 10h18" /><rect x="3" y="4" width="18" height="17" rx="2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  cloud: <path d="M17.5 19H7a5 5 0 1 1 1.1-9.88A6 6 0 0 1 19.72 11 4 4 0 0 1 17.5 19Z" />,
  cpu: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3M10 10h4v4h-4z" /></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" /></>,
  file: <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 13h6m-6 4h6" /></>,
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7Z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  network: <><rect x="3" y="3" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><path d="M6 8v4h12v4m-12-4v4" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  trash: <><path d="M4 7h16m-10 4v6m4-6v6M7 7l1 14h8l1-14M9 7V4h6v3" /></>,
  turbine: <><circle cx="12" cy="10" r="2" /><path d="M12 12v10M10.3 9 4 5.5c1-2 4.5-2.5 7 .5m2.7 3L20 5.5c1 2-.3 5.3-3.5 5.6m-3.3.7.1 7.2c-2.2.3-4.5-2.4-3.3-5.5" /></>,
  upload: <><path d="M12 16V4m0 0-4 4m4-4 4 4" /><path d="M5 20h14" /></>,
  wind: <><path d="M3 8h11c2 0 3-1 3-2.5S16 3 14.5 3C13 3 12 4 12 5" /><path d="M3 12h16c1.7 0 3 1 3 2.5S21 17 19.5 17c-1.4 0-2.5-1-2.5-2" /><path d="M3 16h9" /></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
