import { useCountUp } from "../hooks/useCountUp";

interface CountNumProps {
  value: number;
  format?: (n: number) => string;
}

export function CountNum({ value, format }: CountNumProps) {
  const n = Math.round(useCountUp(value));

  return <>{format ? format(n) : n}</>;
}
