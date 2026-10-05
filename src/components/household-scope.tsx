"use client";
import { createContext, useContext } from "react";
const Scope = createContext<string | null>(null);
export const HouseholdScope = Scope.Provider;
export function HouseholdInput() {
  const value = useContext(Scope);
  return value ? (
    <input type="hidden" name="householdScope" value={value} />
  ) : null;
}
