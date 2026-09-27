import Image from "next/image";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" aria-label="ClimaGrid">
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-secondary/30 ${compact ? "h-9 w-9" : "h-11 w-11"}`}>
        <Image
          src="/climagrid-symbol.png"
          alt=""
          width={compact ? 34 : 42}
          height={compact ? 34 : 42}
          className="h-full w-full object-contain p-0.5"
          priority
        />
      </span>
      <span className={`${compact ? "text-lg" : "text-xl"} font-bold tracking-[-0.03em] text-[#E2E8F0]`}>
        Clima<span className="text-[#38BDF8]">Grid</span>
      </span>
    </div>
  );
}
